' Spiders descending on threads (part of the Flying Witch overlay). The
' portal drops several spiders from the top on SVG threads, swaying as
' they go, then reels them back up.
'
' Each spider is a thread Rectangle plus a clipped sprite window, both
' animated together: the thread grows/shrinks with the drop while the
' sprite rides its end. Spiders start at a random point in the cycle so
' the screen is populated immediately.

sub init()
    m.spiders = []
    m.frame = 0
    m.frameCount = 1
    m.tick = m.top.findNode("frameTick")
    m.tick.observeField("fire", "onFrame")
    m.top.observeField("config", "onConfig")
end sub

sub onConfig()
    cfg = m.top.config
    if cfg = invalid or cfg.stripFile = invalid then return
    m.frameW = Int(cfg.frameW)
    m.frameH = Int(cfg.frameH)
    m.cols = Int(cfg.cols)
    m.frameCount = Int(cfg.frameCount)
    rows = Int(cfg.rows)
    uri = cfg.stripFile
    if Left(uri, 4) <> "http" then uri = m.top.assetBase + uri

    count = 6
    if cfg.count <> invalid then count = Int(cfg.count)
    m.speed = 36
    if cfg.speed <> invalid then m.speed = cfg.speed
    m.maxY = 960
    if cfg.maxY <> invalid then m.maxY = cfg.maxY
    m.sway = 22.5
    if cfg.swayAmplitude <> invalid then m.sway = cfg.swayAmplitude
    m.swayPeriod = 3.77
    if cfg.swayPeriodMs <> invalid then m.swayPeriod = cfg.swayPeriodMs / 1000.0
    threadColor = "0xC8C8C8CC"
    if cfg.threadColor <> invalid then threadColor = cfg.threadColor

    spacing = 1920 / count
    for i = 0 to count - 1
        baseX = spacing * i + spacing / 2 + (Rnd(0) - 0.5) * spacing * 0.4
        if baseX < 60 then baseX = 60
        if baseX > 1860 then baseX = 1860

        host = m.top.createChild("Group")
        host.id = "drop" + i.ToStr() + "_" + Int(Rnd(0) * 100000).ToStr()

        thread = host.createChild("Rectangle")
        thread.id = host.id + "_t"
        thread.color = threadColor
        thread.width = 2
        thread.height = 1
        thread.translation = [0, 0]

        clip = host.createChild("Group")
        clip.id = host.id + "_c"
        clip.clippingRect = [0, 0, m.frameW, m.frameH]
        sheet = clip.createChild("Poster")
        sheet.uri = uri
        sheet.width = m.cols * m.frameW
        sheet.height = rows * m.frameH

        entry = { host: host, thread: thread, clip: clip, sheet: sheet, baseX: baseX, anim: invalid, down: true }
        m.spiders.Push(entry)
        animateSpider(entry, Rnd(0))
    end for
    m.tick.control = "start"
end sub

' one descent (or climb), swaying, with the thread following along
sub animateSpider(entry as object, progress as float)
    if entry.anim <> invalid
        entry.anim.unobserveField("state")
        entry.anim.control = "stop"
        m.top.removeChild(entry.anim)
        entry.anim = invalid
    end if

    fullDuration = m.maxY / m.speed
    remaining = 1.0 - progress
    if remaining < 0.15 then remaining = 0.15
    duration = fullDuration * remaining

    STEPS = 20
    keysT = []
    threadVals = []
    clipVals = []
    for i = 0 to STEPS
        f = i / STEPS
        t = progress + f * remaining
        if entry.down
            y = m.maxY * t
        else
            y = m.maxY * (1.0 - t)
        end if
        x = entry.baseX + m.sway * Sin((t * fullDuration) * (6.2831853 / m.swayPeriod))
        keysT.Push(f)
        ' thread hangs from the top down to the spider
        threadVals.Push([x, 0])
        clipVals.Push([x - m.frameW / 2, y])
    end for

    anim = CreateObject("roSGNode", "Animation")
    anim.duration = duration
    anim.easeFunction = "linear"

    moveClip = CreateObject("roSGNode", "Vector2DFieldInterpolator")
    moveClip.key = keysT
    moveClip.keyValue = clipVals
    moveClip.fieldToInterp = entry.clip.id + ".translation"
    anim.appendChild(moveClip)

    moveThread = CreateObject("roSGNode", "Vector2DFieldInterpolator")
    moveThread.key = keysT
    moveThread.keyValue = threadVals
    moveThread.fieldToInterp = entry.thread.id + ".translation"
    anim.appendChild(moveThread)

    grow = CreateObject("roSGNode", "FloatFieldInterpolator")
    grow.key = [0.0, 1.0]
    if entry.down
        grow.keyValue = [m.maxY * progress + 1, m.maxY + 1]
    else
        grow.keyValue = [m.maxY * remaining + 1, 1]
    end if
    grow.fieldToInterp = entry.thread.id + ".height"
    anim.appendChild(grow)

    m.top.appendChild(anim)
    entry.anim = anim
    anim.observeField("state", "onDropDone")
    anim.control = "start"
end sub

sub onDropDone(ev as object)
    node = ev.getRoSGNode()
    if node.state <> "stopped" then return
    for each entry in m.spiders
        if entry.anim <> invalid and entry.anim.isSameNode(node)
            entry.down = not entry.down
            animateSpider(entry, 0.0)
            return
        end if
    end for
end sub

sub onFrame()
    if m.frameCount < 2 then return
    m.frame = (m.frame + 1) mod m.frameCount
    col = m.frame mod m.cols
    row = (m.frame - col) / m.cols
    for each entry in m.spiders
        entry.sheet.translation = [-col * m.frameW, -row * m.frameH]
    end for
end sub
