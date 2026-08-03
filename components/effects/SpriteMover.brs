' An animated sprite that also travels. Used for Flying Santa and the
' Flying Witch set, which the portal bounces around the screen at fixed
' speeds, flipping (and for spiders, rotating) to face their direction.
'
' Structure matters: the outer "mover" carries translation and rotation,
' while each sprite clips inside its OWN inner group. Roku clips a node
' after its transform, so putting the clip and the transform on the same
' node pushes the sprite out of its cutout and it vanishes. For the same
' reason facing is switched with a pre-mirrored sheet, never a -1 scale.
'
' An optional companion sprite (the witch's bats) rides along inside the
' mover at an offset that mirrors when she turns.

function resolveAsset(name as string) as string
    if Left(name, 4) = "http" then return name
    return m.top.assetBase + name
end function

sub init()
    m.frame = 0
    m.frameCount = 1
    m.compFrame = 0
    m.compFrameCount = 0
    m.dirX = 1
    m.dirY = 1
    m.anim = invalid
    m.tick = m.top.findNode("frameTick")
    m.tick.observeField("fire", "onFrame")
    m.top.observeField("config", "onConfig")
end sub

sub onConfig()
    cfg = m.top.config
    if cfg = invalid or cfg.stripFile = invalid then return
    m.frameCount = Int(cfg.frameCount)
    m.cols = 1
    if cfg.cols <> invalid then m.cols = Int(cfg.cols)
    m.frameW = Int(cfg.frameW)
    m.frameH = Int(cfg.frameH)
    rows = Int((m.frameCount + m.cols - 1) / m.cols)
    if cfg.rows <> invalid then rows = Int(cfg.rows)

    m.mover = m.top.createChild("Group")
    m.mover.id = "mover" + Int(Rnd(0) * 1000000).ToStr()
    m.mover.scaleRotateCenter = [m.frameW / 2, m.frameH / 2]

    clip = m.mover.createChild("Group")
    clip.clippingRect = [0, 0, m.frameW, m.frameH]
    m.sheet = clip.createChild("Poster")
    m.uriNormal = resolveAsset(cfg.stripFile)
    m.uriFlipped = m.uriNormal
    if cfg.stripFileFlipped <> invalid then m.uriFlipped = resolveAsset(cfg.stripFileFlipped)
    m.sheet.uri = m.uriNormal
    m.sheet.width = m.cols * m.frameW
    m.sheet.height = rows * m.frameH
    m.sheet.observeField("loadStatus", "onSheetLoad")

    ' companion (bats trailing the witch)
    comp = cfg.companion
    if comp <> invalid and comp.stripFile <> invalid
        m.compW = Int(comp.frameW)
        m.compH = Int(comp.frameH)
        m.compCols = Int(comp.cols)
        m.compFrameCount = Int(comp.frameCount)
        compRows = Int(comp.rows)
        m.compOffsetX = comp.offsetX
        m.compOffsetY = comp.offsetY
        m.compClip = m.mover.createChild("Group")
        m.compClip.clippingRect = [0, 0, m.compW, m.compH]
        m.compSheet = m.compClip.createChild("Poster")
        m.compUriNormal = resolveAsset(comp.stripFile)
        m.compUriFlipped = m.compUriNormal
        if comp.stripFileFlipped <> invalid then m.compUriFlipped = resolveAsset(comp.stripFileFlipped)
        m.compSheet.uri = m.compUriNormal
        m.compSheet.width = m.compCols * m.compW
        m.compSheet.height = compRows * m.compH
        positionCompanion()
    end if

    ms = 90
    if cfg.frameMs <> invalid then ms = Int(cfg.frameMs)
    if ms < 40 then ms = 40
    m.tick.duration = ms / 1000.0
    m.tick.control = "start"

    m.x = 0
    if cfg.startX <> invalid then m.x = cfg.startX
    m.y = 50
    if cfg.startY <> invalid then m.y = cfg.startY
    m.speedX = 120
    if cfg.speedX <> invalid then m.speedX = cfg.speedX
    m.speedY = 30
    if cfg.speedY <> invalid then m.speedY = cfg.speedY
    if cfg.startDirX <> invalid then m.dirX = Int(cfg.startDirX)
    if cfg.startDirY <> invalid then m.dirY = Int(cfg.startDirY)
    m.maxX = 1920 - m.frameW
    m.maxY = 1080 - m.frameH
    m.mover.translation = [m.x, m.y]
    applyFacing()
    nextLeg()
end sub

sub positionCompanion()
    if m.compClip = invalid then return
    ox = m.compOffsetX
    ' the trail swaps sides when she turns around
    if m.dirX < 0 then ox = m.frameW - m.compOffsetX - m.compW
    m.compClip.translation = [ox, m.compOffsetY]
end sub

' facing: mirrored sheet for direction, plus the spiders' 90-degree turn
sub applyFacing()
    cfg = m.top.config
    if cfg.flipOnTurn = true
        if m.dirX < 0
            m.sheet.uri = m.uriFlipped
            if m.compSheet <> invalid then m.compSheet.uri = m.compUriFlipped
        else
            m.sheet.uri = m.uriNormal
            if m.compSheet <> invalid then m.compSheet.uri = m.compUriNormal
        end if
    end if
    if cfg.rotateOnTurn = true
        deg = 90
        if m.dirX > 0
            if m.dirY < 0 then deg = -90
        else
            if m.dirY < 0 then deg = 90 else deg = -90
        end if
        m.mover.rotation = deg * 0.0174533
    end if
    positionCompanion()
end sub

sub onFrame()
    if m.frameCount > 1
        m.frame = (m.frame + 1) mod m.frameCount
        col = m.frame mod m.cols
        row = (m.frame - col) / m.cols
        m.sheet.translation = [-col * m.frameW, -row * m.frameH]
    end if
    if m.compFrameCount > 1
        m.compFrame = (m.compFrame + 1) mod m.compFrameCount
        ccol = m.compFrame mod m.compCols
        crow = (m.compFrame - ccol) / m.compCols
        m.compSheet.translation = [-ccol * m.compW, -crow * m.compH]
    end if
end sub

' stopping an animation fires its own "stopped" observer, which would
' re-enter onLegDone and scramble direction/position
sub stopLeg()
    if m.anim = invalid then return
    m.anim.unobserveField("state")
    m.anim.control = "stop"
    m.top.removeChild(m.anim)
    m.anim = invalid
end sub

' travel until the next wall, then turn
sub nextLeg()
    stopLeg()

    tX = 999999.0
    if m.dirX > 0 and m.speedX > 0
        tX = (m.maxX - m.x) / m.speedX
    else if m.dirX < 0 and m.speedX > 0
        tX = m.x / m.speedX
    end if
    tY = 999999.0
    if m.dirY > 0 and m.speedY > 0
        tY = (m.maxY - m.y) / m.speedY
    else if m.dirY < 0 and m.speedY > 0
        tY = m.y / m.speedY
    end if

    t = tX
    hitX = true
    hitY = false
    if tY < tX
        t = tY
        hitX = false
        hitY = true
    else if Abs(tY - tX) < 0.05
        hitY = true
    end if
    ' never start a degenerate leg (corners can compute ~0 travel time)
    if t < 0.35 then t = 0.35

    endX = m.x + m.dirX * m.speedX * t
    endY = m.y + m.dirY * m.speedY * t
    if endX < 0 then endX = 0
    if endX > m.maxX then endX = m.maxX
    if endY < 0 then endY = 0
    if endY > m.maxY then endY = m.maxY

    anim = CreateObject("roSGNode", "Animation")
    anim.duration = t
    anim.easeFunction = "linear"
    move = CreateObject("roSGNode", "Vector2DFieldInterpolator")
    move.key = [0.0, 1.0]
    move.keyValue = [[m.x, m.y], [endX, endY]]
    move.fieldToInterp = m.mover.id + ".translation"
    anim.appendChild(move)
    m.top.appendChild(anim)
    m.anim = anim
    anim.observeField("state", "onLegDone")
    anim.control = "start"

    m.x = endX
    m.y = endY
    m.pendingFlipX = hitX
    m.pendingFlipY = hitY
end sub

sub onLegDone(ev as object)
    node = ev.getRoSGNode()
    ' only react to the leg that is actually current
    if m.anim = invalid or not node.isSameNode(m.anim) then return
    if node.state <> "stopped" then return
    if m.pendingFlipX then m.dirX = -m.dirX
    if m.pendingFlipY then m.dirY = -m.dirY
    applyFacing()
    nextLeg()
end sub

sub onSheetLoad()
    if m.sheet.loadStatus = "failed" then print "[Mango] spritemover sheet failed: "; m.sheet.uri
end sub
