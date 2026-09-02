' Pop-up characters (Disappearing Elf, Scary pop-ups): one animated GIF
' from a pool appears at a random spot, plays for a few seconds, pops out
' and comes back somewhere else as a different character.
'
' Node structure matters here: the scale/rotate "pop" is applied to an
' OUTER group while the frame window clips on an INNER group. Roku clips
' a node after its own transform, so scaling the clipping node would push
' the sprite out of its own cutout (that is what made Santa vanish).

sub init()
    m.frame = 0
    m.frameCount = 1
    m.current = invalid
    m.anim = invalid
    m.lastIndex = -1
    m.tick = m.top.findNode("frameTick")
    m.tick.observeField("fire", "onFrame")
    m.dwell = m.top.findNode("dwellTimer")
    m.dwell.observeField("fire", "onDwellDone")
    m.top.observeField("config", "onConfig")
end sub

sub onConfig()
    cfg = m.top.config
    if cfg = invalid or cfg.sprites = invalid or cfg.sprites.Count() = 0 then return

    ' outer: scale/rotate/opacity. inner: the clipped frame window.
    m.host = m.top.createChild("Group")
    m.host.id = "pop" + Int(Rnd(0) * 100000).ToStr()
    m.clip = m.host.createChild("Group")
    m.sheet = m.clip.createChild("Poster")
    m.sheet.observeField("loadStatus", "onSheetLoad")
    showNext()
end sub

function pickSprite() as object
    cfg = m.top.config
    n = cfg.sprites.Count()
    idx = Rnd(n) - 1
    ' avoid repeating the same character twice in a row
    if n > 1
        tries = 0
        while idx = m.lastIndex and tries < 6
            idx = Rnd(n) - 1
            tries = tries + 1
        end while
    end if
    m.lastIndex = idx
    return cfg.sprites[idx]
end function

sub showNext()
    cfg = m.top.config
    sp = pickSprite()
    m.frameW = Int(sp.frameW)
    m.frameH = Int(sp.frameH)
    m.cols = Int(sp.cols)
    m.frameCount = Int(sp.frameCount)
    rows = Int(sp.rows)
    m.frame = 0

    uri = sp.stripFile
    if Left(uri, 4) <> "http" then uri = m.top.assetBase + uri
    m.sheet.uri = uri
    m.sheet.width = m.cols * m.frameW
    m.sheet.height = rows * m.frameH
    m.sheet.translation = [0, 0]
    m.clip.clippingRect = [0, 0, m.frameW, m.frameH]

    ms = 90
    if sp.frameMs <> invalid then ms = Int(sp.frameMs)
    if ms < 40 then ms = 40
    m.tick.duration = ms / 1000.0
    m.tick.control = "start"

    ' random position, kept fully on screen
    maxX = cvW() - m.frameW
    maxY = cvH() - m.frameH
    if maxX < 0 then maxX = 0
    if maxY < 0 then maxY = 0
    m.host.translation = [Rnd(0) * maxX, Rnd(0) * maxY]
    m.host.scaleRotateCenter = [m.frameW / 2, m.frameH / 2]

    popIn()
end sub

' portal's pop-in: scale 0 -> 1.5 -> 0.8 -> 1 with a little spin
sub popIn()
    stopAnim()
    cfg = m.top.config
    d = 0.5
    if cfg.popMs <> invalid then d = Int(cfg.popMs) / 1000.0

    anim = CreateObject("roSGNode", "Animation")
    anim.duration = d
    anim.easeFunction = "outQuad"
    sc = CreateObject("roSGNode", "Vector2DFieldInterpolator")
    sc.key = [0.0, 0.5, 0.75, 1.0]
    sc.keyValue = [[0.0, 0.0], [1.5, 1.5], [0.8, 0.8], [1.0, 1.0]]
    sc.fieldToInterp = m.host.id + ".scale"
    anim.appendChild(sc)
    rot = CreateObject("roSGNode", "FloatFieldInterpolator")
    rot.key = [0.0, 1.0]
    rot.keyValue = [-3.14159, 0.0]
    rot.fieldToInterp = m.host.id + ".rotation"
    anim.appendChild(rot)
    m.top.appendChild(anim)
    m.anim = anim
    anim.control = "start"

    ' hold, then pop out
    lo = 4000
    hi = 6000
    if cfg.dwellMsRange <> invalid and cfg.dwellMsRange.Count() = 2
        lo = cfg.dwellMsRange[0]
        hi = cfg.dwellMsRange[1]
    end if
    m.dwell.duration = (lo + Rnd(0) * (hi - lo)) / 1000.0
    m.dwell.control = "start"
end sub

sub onDwellDone()
    stopAnim()
    anim = CreateObject("roSGNode", "Animation")
    anim.duration = 0.4
    anim.easeFunction = "inQuad"
    sc = CreateObject("roSGNode", "Vector2DFieldInterpolator")
    sc.key = [0.0, 1.0]
    sc.keyValue = [[1.0, 1.0], [0.0, 0.0]]
    sc.fieldToInterp = m.host.id + ".scale"
    anim.appendChild(sc)
    m.top.appendChild(anim)
    m.anim = anim
    anim.observeField("state", "onPopOutDone")
    anim.control = "start"
end sub

sub onPopOutDone(ev as object)
    node = ev.getRoSGNode()
    if m.anim = invalid or not node.isSameNode(m.anim) then return
    if node.state <> "stopped" then return
    stopAnim()
    showNext()
end sub

sub stopAnim()
    if m.anim = invalid then return
    m.anim.unobserveField("state")
    m.anim.control = "stop"
    m.top.removeChild(m.anim)
    m.anim = invalid
end sub

sub onFrame()
    if m.frameCount < 2 then return
    m.frame = (m.frame + 1) mod m.frameCount
    col = m.frame mod m.cols
    row = (m.frame - col) / m.cols
    m.sheet.translation = [-col * m.frameW, -row * m.frameH]
end sub

sub onSheetLoad()
    if m.sheet.loadStatus = "failed" then print "[Mango] popup sheet failed: "; m.sheet.uri
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
