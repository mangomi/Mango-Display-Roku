' Native countdown: renders the day/hour/minute/second NUMBERS the render
' service hid (box chrome, unit labels and event name stay baked), at the
' measured rects/styles. Pure epoch math against the manifest's absolute
' target - timezone-free. Matches the portal: units compute with fixed
' modulo regardless of which boxes are enabled, and the visible value
' runs one second ahead (the portal subtracts 1s before display).

sub init()
    m.labels = {}
    m.tick = m.top.findNode("tick")
    m.tick.observeField("fire", "onTick")
    m.top.observeField("config", "onConfig")
end sub

sub onConfig()
    cfg = m.top.config
    if cfg = invalid or cfg.elements = invalid or cfg.targetEpochSeconds = invalid then return
    for each unit in ["day", "hour", "minute", "second"]
        el = cfg.elements.Lookup(unit)
        if el <> invalid
            m.labels[unit] = makeLabel(el)
        end if
    end for
    updateText()
    m.tick.control = "start"
end sub

function makeLabel(el as object) as object
    lbl = m.top.createChild("Label")
    lbl.translation = [el.rect.x, el.rect.y]
    lbl.width = el.rect.w
    lbl.height = el.rect.h
    lbl.vertAlign = "center"
    align = "center"
    if el.align = "left" or el.align = "start" then align = "left"
    if el.align = "right" or el.align = "end" then align = "right"
    lbl.horizAlign = align
    lbl.color = el.color.Replace("#", "0x")
    fnt = CreateObject("roSGNode", "Font")
    if el.bold = true
        fnt.uri = "pkg:/fonts/SourceSansPro-Bold.otf"
    else
        fnt.uri = "pkg:/fonts/SourceSansPro-Regular.otf"
    end if
    fnt.size = Int(el.fontSizePx)
    lbl.font = fnt
    return lbl
end function

sub onTick()
    updateText()
end sub

sub updateText()
    cfg = m.top.config
    now = CreateObject("roDateTime")
    ' ("rem" is the BASIC comment keyword - never use it as a variable)
    remainSecs = Int(cfg.targetEpochSeconds) - now.AsSeconds() - 1
    if remainSecs < 0 then remainSecs = 0
    days = Int(remainSecs / 86400)
    hours = Int((remainSecs mod 86400) / 3600)
    minutes = Int((remainSecs mod 3600) / 60)
    seconds = remainSecs mod 60
    if m.labels.DoesExist("day") then m.labels.day.text = days.ToStr()
    if m.labels.DoesExist("hour") then m.labels.hour.text = hours.ToStr()
    if m.labels.DoesExist("minute") then m.labels.minute.text = minutes.ToStr()
    if m.labels.DoesExist("second") then m.labels.second.text = seconds.ToStr()
end sub
