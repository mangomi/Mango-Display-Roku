' Native clock: draws the time (and date) lines the render service hid,
' at the exact rects/styles it measured (see NATIVE_WIDGETS.md).
' Ticks every 5s; shows the DISPLAY's timezone via tzOffsetMinutes from
' the manifest (falls back to the device clock when absent).

sub init()
    m.timeLabel = invalid
    m.dateLabel = invalid
    m.tick = m.top.findNode("tick")
    m.tick.observeField("fire", "onTick")
    m.top.observeField("config", "onConfig")
end sub

sub onConfig()
    cfg = m.top.config
    if cfg = invalid or cfg.elements = invalid then return
    if cfg.elements.time <> invalid
        m.timeLabel = makeLabel(cfg.elements.time)
    end if
    if cfg.elements.date <> invalid
        m.dateLabel = makeLabel(cfg.elements.date)
    end if
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

' current time shifted into the display's timezone (manifest offset from
' UTC); invalid offset -> device-local time
function displayNow() as object
    now = CreateObject("roDateTime")
    cfg = m.top.config
    offset = invalid
    if cfg <> invalid then offset = cfg.tzOffsetMinutes
    if offset <> invalid
        shifted = CreateObject("roDateTime")
        shifted.FromSeconds(now.AsSeconds() + Int(offset) * 60)
        return shifted
    end if
    now.ToLocalTime()
    return now
end function

sub updateText()
    now = displayNow()
    cfg = m.top.config
    if m.timeLabel <> invalid and cfg.elements.time <> invalid
        f = cfg.elements.time
        h = now.GetHours()
        mm = now.GetMinutes().ToStr()
        if Len(mm) < 2 then mm = "0" + mm
        if f.is24h = true
            hh = h.ToStr()
            if f.padHour = true and Len(hh) < 2 then hh = "0" + hh
            m.timeLabel.text = hh + ":" + mm
        else
            mer = " AM"
            if h >= 12 then mer = " PM"
            if f.upperMeridiem <> true then mer = LCase(mer)
            h12 = h mod 12
            if h12 = 0 then h12 = 12
            hh = h12.ToStr()
            if f.padHour = true and Len(hh) < 2 then hh = "0" + hh
            m.timeLabel.text = hh + ":" + mm + mer
        end if
    end if
    if m.dateLabel <> invalid
        wd = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        mo = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
        m.dateLabel.text = wd[now.GetDayOfWeek()] + ", " + mo[now.GetMonth() - 1] + " " + now.GetDayOfMonth().ToStr()
    end if
end sub
