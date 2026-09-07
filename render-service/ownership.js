/*
 * Display ownership: which task serves which display.
 *
 * The backend allows ONE socket per display, so exactly one task may own
 * a display at a time. With several tasks behind one load balancer a
 * device's poll lands anywhere; the task that gets it looks the display
 * up here, serves it if it is the owner, forwards to the owner if not,
 * and claims it if nobody does. Ownership is a LEASE: the owner renews
 * every RENEW_MS to now + LEASE_MS, and a task that dies simply stops
 * renewing - time does the recovery, nothing has to notice. A task that
 * shuts down cleanly releases its rows first so the hand-over takes one
 * poll instead of a lease.
 *
 * Two backends behind one interface: memory (single task, local runs
 * and tests) and DynamoDB (the fleet). A conditional write is the whole
 * concurrency story - two tasks racing for the same display cannot both
 * win, because the second condition fails.
 *
 * Decided with Dave 2026-09-07: lease 90s, renew 30s (three chances to
 * renew before a display is handed away; recovery after a sudden death
 * is bounded by the lease plus one poll interval).
 */
const LEASE_MS = parseInt(process.env.OWNERSHIP_LEASE_MS || "90000", 10);
const RENEW_MS = parseInt(process.env.OWNERSHIP_RENEW_MS || "30000", 10);
/* the row's DynamoDB TTL: well past the lease, so a dead owner's row
 * vanishes on its own without ever racing a live renewal */
const TTL_SLACK_S = 3600;

class ConditionFailed extends Error {}

/* ---- memory backend --------------------------------------------------- */

class MemoryOwnership {
  constructor() {
    this.rows = new Map();
  }
  async lookup(deviceId) {
    const r = this.rows.get(deviceId);
    if (!r || r.leaseUntil <= Date.now()) return null;
    return { ...r };
  }
  async claim(deviceId, me) {
    const cur = this.rows.get(deviceId);
    if (cur && cur.leaseUntil > Date.now() && cur.taskId !== me.taskId) throw new ConditionFailed();
    const row = { deviceId, taskId: me.taskId, taskAddr: me.taskAddr, leaseUntil: Date.now() + LEASE_MS, claimedAt: cur && cur.taskId === me.taskId ? cur.claimedAt : Date.now() };
    this.rows.set(deviceId, row);
    return { ...row };
  }
  async renew(deviceId, me) {
    const cur = this.rows.get(deviceId);
    if (!cur || cur.taskId !== me.taskId) throw new ConditionFailed();
    cur.leaseUntil = Date.now() + LEASE_MS;
  }
  async release(deviceId, me) {
    const cur = this.rows.get(deviceId);
    if (cur && cur.taskId === me.taskId) this.rows.delete(deviceId);
  }
  async ping() {
    return true;
  }
}

/* ---- DynamoDB backend ------------------------------------------------- */

class DynamoOwnership {
  constructor(table, region) {
    const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
    this.ddb = new DynamoDBClient(region ? { region } : {});
    this.table = table;
    const cmds = require("@aws-sdk/client-dynamodb");
    this.GetItemCommand = cmds.GetItemCommand;
    this.PutItemCommand = cmds.PutItemCommand;
    this.UpdateItemCommand = cmds.UpdateItemCommand;
    this.DeleteItemCommand = cmds.DeleteItemCommand;
    this.DescribeTableCommand = cmds.DescribeTableCommand;
  }

  async lookup(deviceId) {
    const r = await this.ddb.send(
      new this.GetItemCommand({ TableName: this.table, Key: { deviceId: { S: deviceId } }, ConsistentRead: true }),
    );
    if (!r.Item) return null;
    const row = {
      deviceId,
      taskId: r.Item.taskId.S,
      taskAddr: r.Item.taskAddr.S,
      leaseUntil: parseInt(r.Item.leaseUntil.N, 10),
      claimedAt: parseInt((r.Item.claimedAt || { N: "0" }).N, 10),
    };
    if (row.leaseUntil <= Date.now()) return null;
    return row;
  }

  /* wins if the row is missing, its lease has lapsed, or we already own
   * it (re-claim after a restart of our own) */
  async claim(deviceId, me) {
    const now = Date.now();
    const row = {
      deviceId: { S: deviceId },
      taskId: { S: me.taskId },
      taskAddr: { S: me.taskAddr },
      leaseUntil: { N: String(now + LEASE_MS) },
      claimedAt: { N: String(now) },
      ttl: { N: String(Math.floor((now + LEASE_MS) / 1000) + TTL_SLACK_S) },
    };
    try {
      await this.ddb.send(
        new this.PutItemCommand({
          TableName: this.table,
          Item: row,
          ConditionExpression: "attribute_not_exists(deviceId) OR leaseUntil <= :now OR taskId = :me",
          ExpressionAttributeValues: { ":now": { N: String(now) }, ":me": { S: me.taskId } },
        }),
      );
    } catch (e) {
      if (e.name === "ConditionalCheckFailedException") throw new ConditionFailed();
      throw e;
    }
    return { deviceId, taskId: me.taskId, taskAddr: me.taskAddr, leaseUntil: now + LEASE_MS, claimedAt: now };
  }

  async renew(deviceId, me) {
    const now = Date.now();
    try {
      await this.ddb.send(
        new this.UpdateItemCommand({
          TableName: this.table,
          Key: { deviceId: { S: deviceId } },
          UpdateExpression: "SET leaseUntil = :lu, #ttl = :ttl",
          ConditionExpression: "taskId = :me",
          ExpressionAttributeNames: { "#ttl": "ttl" },
          ExpressionAttributeValues: {
            ":lu": { N: String(now + LEASE_MS) },
            ":ttl": { N: String(Math.floor((now + LEASE_MS) / 1000) + TTL_SLACK_S) },
            ":me": { S: me.taskId },
          },
        }),
      );
    } catch (e) {
      if (e.name === "ConditionalCheckFailedException") throw new ConditionFailed();
      throw e;
    }
  }

  async release(deviceId, me) {
    try {
      await this.ddb.send(
        new this.DeleteItemCommand({
          TableName: this.table,
          Key: { deviceId: { S: deviceId } },
          ConditionExpression: "taskId = :me",
          ExpressionAttributeValues: { ":me": { S: me.taskId } },
        }),
      );
    } catch (e) {
      if (e.name === "ConditionalCheckFailedException") return; /* not ours any more - nothing to release */
      throw e;
    }
  }

  async ping() {
    await this.ddb.send(new this.DescribeTableCommand({ TableName: this.table }));
    return true;
  }
}

/* ---- the manager a fleet uses ------------------------------------------ */

/* Wraps a backend with this task's identity, the renew loop for every
 * display it owns, and the "we lost it" callback. `me` is
 * { taskId, taskAddr } where taskAddr is host:port reachable by the
 * other tasks (the private IP on Fargate, 127.0.0.1:port locally). */
class OwnershipManager {
  constructor(backend, me, opts = {}) {
    this.backend = backend;
    this.me = me;
    this.owned = new Map(); // deviceId -> { claimedAt }
    this.onLost = opts.onLost || (() => {});
    this.log = opts.log || (() => {});
    this.timer = null;
    this.lastError = null;
    this.lastOkAt = Date.now();
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.renewAll().catch(() => {}), RENEW_MS);
    this.timer.unref && this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  owns(deviceId) {
    return this.owned.has(deviceId);
  }

  count() {
    return this.owned.size;
  }

  async lookup(deviceId) {
    try {
      const r = await this.backend.lookup(deviceId);
      this.noteOk();
      return r;
    } catch (e) {
      this.noteError(e);
      throw e;
    }
  }

  /* true if we own it now, false if someone else won */
  async claim(deviceId) {
    try {
      await this.backend.claim(deviceId, this.me);
      this.noteOk();
    } catch (e) {
      if (e instanceof ConditionFailed) return false;
      this.noteError(e);
      throw e;
    }
    this.owned.set(deviceId, { claimedAt: Date.now() });
    return true;
  }

  async release(deviceId) {
    if (!this.owned.has(deviceId)) return;
    this.owned.delete(deviceId);
    try {
      await this.backend.release(deviceId, this.me);
      this.noteOk();
    } catch (e) {
      this.noteError(e);
    }
  }

  async releaseAll() {
    const ids = [...this.owned.keys()];
    await Promise.allSettled(ids.map((id) => this.release(id)));
  }

  async renewAll() {
    const ids = [...this.owned.keys()];
    for (const id of ids) {
      if (!this.owned.has(id)) continue;
      try {
        await this.backend.renew(id, this.me);
        this.noteOk();
      } catch (e) {
        if (e instanceof ConditionFailed) {
          /* somebody else holds it now (our lease lapsed while we were
           * stuck, or a release raced): drop it, the fleet stops the worker */
          this.owned.delete(id);
          this.log("ownership: lost " + id + " - another task holds it");
          try {
            this.onLost(id);
          } catch (err) {}
        } else {
          /* transport trouble: keep the display - a lease that has not
           * lapsed is still ours, and the next tick retries */
          this.noteError(e);
        }
      }
    }
  }

  noteOk() {
    this.lastError = null;
    this.lastOkAt = Date.now();
  }
  noteError(e) {
    this.lastError = { at: Date.now(), message: e.message };
  }

  health() {
    return {
      owned: this.owned.size,
      lastOkAgoMs: Date.now() - this.lastOkAt,
      lastError: this.lastError,
    };
  }
}

function backendFromEnv(log) {
  const mode = (process.env.OWNERSHIP || "off").toLowerCase();
  if (mode === "off") return null;
  if (mode === "memory") return new MemoryOwnership();
  if (mode === "dynamo" || mode === "dynamodb") {
    const table = process.env.OWNERSHIP_TABLE;
    if (!table) throw new Error("OWNERSHIP=dynamo needs OWNERSHIP_TABLE");
    return new DynamoOwnership(table, process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1");
  }
  throw new Error("OWNERSHIP must be off, memory or dynamo (got '" + mode + "')");
}

module.exports = { MemoryOwnership, DynamoOwnership, OwnershipManager, ConditionFailed, backendFromEnv, LEASE_MS, RENEW_MS };
