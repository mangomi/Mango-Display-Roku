' Natively animated weather icon.
'
' The icon's own SVG moves its parts with three primitives - rotate about
' a point, translate, fade - and the render service ships each moving
' part ONCE as a transparent PNG together with exactly that motion. This
' component reproduces it with SceneGraph Animations: every refresh,
' sub-pixel, no filmed sheet (GifOverlay) and no frame cadence at all.
' (See MANIFEST.md "motion".)
'
' config:
'   rect     { x, y, w, h }          the icon box, canvas px
'   layers   [ { file, tracks, opacity, chain } ]  bottom to top; every
'                                    PNG is the whole box, so they stack
'                                    at 0,0
'   chain    [ { tracks } ]  outer motions applied ON TOP of the layer's
'                            own (a flake spins and fades inside a group
'                            that falls): one nested group per level,
'                            outermost first
'   track    { prop, cycleMs, delayMs, keys, values, center }
'     prop     "rotation" (values in degrees, clockwise as the viewer
'              sees it; center = [x, y] px within the box),
'              "translation" (values [[dx, dy]] px), "scale" (values
'              [[sx, sy]] about center), or "opacity"
'     keys     0..1 positions within one cycle; values pair with them
'     cycleMs  one loop, held at the last value through any gap
'     delayMs  phase: wait this long before the first loop
sub init()
    m.anims = []
    m.top.observeField("config", "onConfig")
end sub

sub onConfig()
    cfg = m.top.config
    if cfg = invalid or cfg.rect = invalid or cfg.layers = invalid then return
    ' a re-config rebuilds from scratch - never stack a second icon
    for each a in m.anims
        a.control = "stop"
    end for
    m.anims = []
    while m.top.getChildCount() > 0
        m.top.removeChildIndex(0)
    end while
    holder = m.top.createChild("Group")
    holder.translation = [cfg.rect.x, cfg.rect.y]
    ' The box clips, as the portal's does: a raindrop's travel starts
    ' above the strip and the strip has overflow hidden, so without this
    ' the drops appeared above the cell (Dave, 2026-09-02). Icons are
    ' unaffected - their SVG already draws inside its own box.
    holder.clippingRect = [0, 0, cfg.rect.w, cfg.rect.h]
    n = 0
    for each layer in cfg.layers
        ' outer chain levels first, each a group nested in the previous
        parent = holder
        lvl = 0
        if layer.chain <> invalid
            for each level in layer.chain
                cg = parent.createChild("Group")
                cg.id = "mmMotionL" + n.ToStr() + "c" + lvl.ToStr()
                animateTracks(cg, level.tracks)
                parent = cg
                lvl = lvl + 1
            end for
        end if
        g = parent.createChild("Group")
        g.id = "mmMotionL" + n.ToStr()
        p = g.createChild("Poster")
        p.uri = m.top.assetBase + layer.file
        p.width = cfg.rect.w
        p.height = cfg.rect.h
        if layer.opacity <> invalid then g.opacity = layer.opacity
        animateTracks(g, layer.tracks)
        n = n + 1
    end for
end sub

sub animateTracks(g as object, tracks as object)
    if tracks = invalid then return
    for each t in tracks
        interp = buildInterp(g, t)
        if interp <> invalid
            anim = CreateObject("roSGNode", "Animation")
            anim.duration = t.cycleMs / 1000.0
            anim.repeat = true
            anim.easeFunction = "linear"
            if t.delayMs <> invalid and t.delayMs > 0 then anim.delay = t.delayMs / 1000.0
            anim.appendChild(interp)
            m.top.appendChild(anim)
            m.anims.push(anim)
            ' start NOW (see ScrollOverlay): a cached texture can be
            ' ready before any observer exists
            anim.control = "start"
        end if
    end for
end sub

' One track -> one interpolator on the layer group. Roku's rotation is
' positive counter-clockwise; the SVG's is clockwise, hence the sign.
function buildInterp(g as object, t as object) as object
    if t.prop = invalid or t.keys = invalid or t.values = invalid then return invalid
    if t.prop = "rotation"
        if t.center <> invalid then g.scaleRotateCenter = [t.center[0], t.center[1]]
        i = CreateObject("roSGNode", "FloatFieldInterpolator")
        vals = []
        for each d in t.values
            vals.push(-d * 0.017453293)
        end for
        i.key = t.keys
        i.keyValue = vals
        i.fieldToInterp = g.id + ".rotation"
        return i
    else if t.prop = "translation"
        i = CreateObject("roSGNode", "Vector2DFieldInterpolator")
        i.key = t.keys
        i.keyValue = t.values
        i.fieldToInterp = g.id + ".translation"
        return i
    else if t.prop = "scale"
        if t.center <> invalid then g.scaleRotateCenter = [t.center[0], t.center[1]]
        i = CreateObject("roSGNode", "Vector2DFieldInterpolator")
        i.key = t.keys
        i.keyValue = t.values
        i.fieldToInterp = g.id + ".scale"
        return i
    else if t.prop = "opacity"
        i = CreateObject("roSGNode", "FloatFieldInterpolator")
        i.key = t.keys
        i.keyValue = t.values
        i.fieldToInterp = g.id + ".opacity"
        return i
    end if
    return invalid
end function
