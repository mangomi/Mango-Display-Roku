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

' The device composes only the VALUES; every format decision - 12/24h,
' whether the meridiem shows at all, its localized strings and position,
' the date's word order and names in the display's language - arrives in
' the manifest, taken from the user's own settings. The English literals
' below are ONLY the fallback for manifests that predate those fields.
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
            h12 = h mod 12
            if h12 = 0 then h12 = 12
            hh = h12.ToStr()
            if f.padHour = true and Len(hh) < 2 then hh = "0" + hh
            txt = hh + ":" + mm
            if f.showMeridiem <> invalid
                ' the settings decide: shown only when the user enabled
                ' it, with the language's own strings on the language's
                ' own side of the time
                if f.showMeridiem = true
                    mer = f.pm
                    if h < 12 then mer = f.am
                    if mer <> invalid
                        sp = ""
                        if f.meridiemSpaced = true then sp = " "
                        if f.meridiemPrefix = true
                            txt = mer + sp + txt
                        else
                            txt = txt + sp + mer
                        end if
                    end if
                end if
            else
                ' legacy manifest: old English-suffix behavior
                mer = " AM"
                if h >= 12 then mer = " PM"
                if f.upperMeridiem <> true then mer = LCase(mer)
                txt = txt + mer
            end if
            m.timeLabel.text = txt
        end if
    end if
    if m.dateLabel <> invalid
        d = invalid
        if cfg.elements <> invalid then d = cfg.elements.date
        if d <> invalid and d.pattern <> invalid and d.weekdays <> invalid and d.months <> invalid
            txt = ""
            for each tok in d.pattern
                if tok.t = "weekday"
                    txt = txt + d.weekdays[now.GetDayOfWeek()]
                else if tok.t = "month"
                    txt = txt + d.months[now.GetMonth() - 1]
                else if tok.t = "day"
                    txt = txt + now.GetDayOfMonth().ToStr()
                else if tok.v <> invalid
                    txt = txt + tok.v
                end if
            end for
            m.dateLabel.text = txt
        else
            ' legacy manifest: English fallback
            wd = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
            mo = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
            m.dateLabel.text = wd[now.GetDayOfWeek()] + ", " + mo[now.GetMonth() - 1] + " " + now.GetDayOfMonth().ToStr()
        end if
    end if
end sub
