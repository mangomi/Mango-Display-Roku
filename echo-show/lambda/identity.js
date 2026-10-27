// The display's permanent identity: "ET" + 9 digits, generated once per
// Echo and kept forever. The Roku keeps its code in roRegistry and tvOS in
// the Keychain; an Alexa skill has no storage ON the device, so the code
// lives in the skill's table keyed by the Alexa device id
// (context.System.device.deviceId - stable for this skill on this Echo,
// survives the skill being disabled and re-enabled only if Amazon keeps
// the id, which it does for the same account + device).

const crypto = require("crypto");

const PREFIX = "ET";

/** "ET" + 9 random digits 1-9 - the Roku/Tizen/tvOS generator's range,
 * so codes never contain a zero. The prefix is the only backend-visible
 * difference from the other painted TVs. */
function generateCode() {
  let digits = "";
  for (let i = 0; i < 9; i++) digits += String(crypto.randomInt(1, 10));
  return PREFIX + digits;
}

/** DynamoDB store: table with partition key `alexaDeviceId` (string).
 * Table name from DEVICE_TABLE; the SDK ships with the Lambda runtime. */
function dynamoStore(table) {
  const { DynamoDBClient, GetItemCommand, PutItemCommand } = require("@aws-sdk/client-dynamodb");
  const db = new DynamoDBClient({});
  return {
    async get(alexaDeviceId) {
      const r = await db.send(new GetItemCommand({ TableName: table, Key: { alexaDeviceId: { S: alexaDeviceId } } }));
      return r.Item && r.Item.code ? r.Item.code.S : null;
    },
    async put(alexaDeviceId, code) {
      // conditional: two simultaneous first launches must not mint two codes
      try {
        await db.send(new PutItemCommand({
          TableName: table,
          Item: { alexaDeviceId: { S: alexaDeviceId }, code: { S: code }, createdAt: { S: new Date().toISOString() } },
          ConditionExpression: "attribute_not_exists(alexaDeviceId)",
        }));
        return code;
      } catch (e) {
        if (e.name === "ConditionalCheckFailedException") return this.get(alexaDeviceId);
        throw e;
      }
    },
  };
}

/** In-memory store for local runs (tools/try-skill.js). */
function memoryStore(seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    async get(id) { return m.get(id) || null; },
    async put(id, code) { if (!m.has(id)) m.set(id, code); return m.get(id); },
  };
}

let store = null;
function defaultStore() {
  if (!store) store = process.env.DEVICE_TABLE ? dynamoStore(process.env.DEVICE_TABLE) : memoryStore();
  return store;
}

async function getOrCreateCode(alexaDeviceId, s = defaultStore()) {
  const existing = await s.get(alexaDeviceId);
  if (existing) return existing;
  return s.put(alexaDeviceId, generateCode());
}

module.exports = { PREFIX, generateCode, getOrCreateCode, memoryStore, setStore: (s) => { store = s; } };
