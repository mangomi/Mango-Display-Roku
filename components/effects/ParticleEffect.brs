' Native particle engine for the portal's visual overlays (balloons,
' and later snow/leaves/hearts - same model, different sprites and
' direction). The portal draws these on a full-screen canvas with
' per-frame randomness; film strips can't reproduce that (texture budget,
' visible looping, ~10fps), so each particle is a Poster driven by a
' SceneGraph Animation, which the platform interpolates at display frame
' rate. Every particle re-randomizes when it completes a trip, so the
' motion never repeats. (See NATIVE_WIDGETS.md.)

sub init()
    m.particles = []
    m.spawnTimer = m.top.findNode("spawnTimer")
    m.spawnTimer.observeField("fire", "onSpawnTick")
    m.top.observeField("config", "onConfig")
end sub

sub onConfig()
    cfg = m.top.config
    if cfg = invalid or cfg.sprites = invalid or cfg.sprites.Count() = 0 then return
    m.cfg = cfg
    m.maxCount = 12
    if cfg.maxCount <> invalid then m.maxCount = Int(cfg.maxCount)
    every = 1.6
    if cfg.spawnEverySeconds <> invalid then every = cfg.spawnEverySeconds
    m.spawnTimer.duration = every
    m.spawnTimer.control = "start"
    ' seed a few immediately so the screen isn't empty for the first
    ' several seconds, staggered along their path
    for i = 0 to 3
        spawnParticle(Rnd(0) * 0.7)
    end for
end sub

sub onSpawnTick()
    if m.particles.Count() < m.maxCount
        spawnParticle(0.0)
    end if
end sub

function pick(range as object, fallbackLo as float, fallbackHi as float) as float
    lo = fallbackLo
    hi = fallbackHi
    if range <> invalid and range.Count() = 2
        lo = range[0]
        hi = range[1]
    end if
    return lo + Rnd(0) * (hi - lo)
end function

' progress 0.0 = start of the path, >0 starts the particle partway along
sub spawnParticle(progress as float)
    cfg = m.cfg
    p = m.top.createChild("Poster")
    p.id = "pt" + m.particles.Count().ToStr() + "_" + Int(Rnd(0) * 100000).ToStr()
    sprite = cfg.sprites[Rnd(cfg.sprites.Count()) - 1]
    ' sprites carry their real aspect (h/w) so the art is never squashed
    aspect = 1.3
    uri = ""
    if type(sprite) = "roAssociativeArray"
        uri = sprite.url
        if sprite.aspect <> invalid then aspect = sprite.aspect
    else
        uri = sprite
    end if
    ' locally generated sprites arrive as bare filenames
    if Left(uri, 4) <> "http" then uri = m.top.assetBase + uri
    p.uri = uri
    entry = { node: p, anim: invalid, aspect: aspect }
    m.particles.Push(entry)
    animateParticle(entry, progress)
end sub

sub animateParticle(entry as object, progress as float)
    cfg = m.cfg
    p = entry.node

    size = pick(cfg.sizeRange, 30, 70)
    speed = pick(cfg.speedRange, 12, 42)
    amp = pick(cfg.driftAmplitudeRange, 20, 60)
    period = pick(cfg.driftPeriodRange, 4.2, 12.6)
    phase = Rnd(0) * 6.2831853
    growth = 1.25
    if cfg.growthFactor <> invalid then growth = cfg.growthFactor
    fadeInPx = 100
    if cfg.fadeInPx <> invalid then fadeInPx = cfg.fadeInPx

    ' width drives the size and height follows the art's own ratio -
    ' exactly how the portal scales them (drawH = natH * size/natW)
    aspect = 1.3
    if entry.aspect <> invalid then aspect = entry.aspect
    p.width = size
    p.height = size * aspect
    p.scaleRotateCenter = [size / 2, (size * aspect) / 2]

    startX = Rnd(0) * cvW()
    ' travel from just off one edge to just off the other
    travel = cvH() + p.height * 2
    fallsDown = false
    if cfg.direction <> invalid and cfg.direction = "down" then fallsDown = true
    fullDuration = travel / speed
    if fullDuration < 4 then fullDuration = 4
    ' seeded particles start partway along the path (Animation has no
    ' seek field, so the path itself starts further along)
    remaining = 1.0 - progress
    if remaining < 0.15 then remaining = 0.15
    duration = fullDuration * remaining

    ' sample the sine drift into keyframes - the engine interpolates
    ' between them, so the curve stays smooth without per-frame script
    STEPS = 24
    keys = []
    vals = []
    for i = 0 to STEPS
        f = i / STEPS
        t = progress + f * remaining
        if fallsDown
            y = -p.height + travel * t
        else
            y = cvH() + p.height - travel * t
        end if
        x = startX + amp * Sin(t * fullDuration * (6.2831853 / period) + phase)
        keys.Push(f)
        vals.Push([x, y])
    end for

    anim = CreateObject("roSGNode", "Animation")
    anim.duration = duration
    anim.easeFunction = "linear"

    move = CreateObject("roSGNode", "Vector2DFieldInterpolator")
    move.key = keys
    move.keyValue = vals
    move.fieldToInterp = p.id + ".translation"
    anim.appendChild(move)

    ' fade in over the first stretch of travel, like the portal does
    ' (particles seeded mid-path are already visible)
    fade = CreateObject("roSGNode", "FloatFieldInterpolator")
    fadeFrac = (fadeInPx / travel) / remaining
    if fadeFrac > 0.4 then fadeFrac = 0.4
    if progress > 0.02
        fade.key = [0.0, 1.0]
        fade.keyValue = [1.0, 1.0]
    else
        fade.key = [0.0, fadeFrac, 1.0]
        fade.keyValue = [0.0, 1.0, 1.0]
    end if
    fade.fieldToInterp = p.id + ".opacity"
    anim.appendChild(fade)

    grow = CreateObject("roSGNode", "Vector2DFieldInterpolator")
    grow.key = [0.0, 1.0]
    grow.keyValue = [[1.0 + (growth - 1.0) * progress, 1.0 + (growth - 1.0) * progress], [growth, growth]]
    grow.fieldToInterp = p.id + ".scale"
    anim.appendChild(grow)

    ' leaves flutter: their GIF animation can't play, so spin natively
    if cfg.spinTurnsRange <> invalid
        turns = pick(cfg.spinTurnsRange, -1.0, 1.0)
        spin = CreateObject("roSGNode", "FloatFieldInterpolator")
        spin.key = [0.0, 1.0]
        spin.keyValue = [0.0, turns * 6.2831853 * remaining]
        spin.fieldToInterp = p.id + ".rotation"
        anim.appendChild(spin)
    end if

    m.top.appendChild(anim)
    if entry.anim <> invalid then m.top.removeChild(entry.anim)
    entry.anim = anim
    anim.observeField("state", "onParticleState")
    anim.control = "start"
end sub

' when a particle finishes its trip, re-randomize and send it again
sub onParticleState(ev as object)
    node = ev.getRoSGNode()
    if node.state <> "stopped" then return
    for each entry in m.particles
        if entry.anim <> invalid and entry.anim.isSameNode(node)
            animateParticle(entry, 0.0)
            return
        end if
    end for
end sub

' canvas bounds from the config (the service renders a rotated display at a
' portrait canvas); screen size is the fallback for older manifests
function cvW() as integer
    c = m.top.config
    if c <> invalid and c.canvasW <> invalid then return Int(c.canvasW)
    return 1920
end function
function cvH() as integer
    c = m.top.config
    if c <> invalid and c.canvasH <> invalid then return Int(c.canvasH)
    return 1080
end function
