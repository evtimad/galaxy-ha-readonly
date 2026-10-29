# Galaxy 3-144 Gateway (v0.4.0)

Receives Galaxy E080 "Alarm Monitor" (A.Monitor) events in Home Assistant, replacing the
Windows Event Monitor as the receiver. The app answers only with the same session/ACK frames
that Event Monitor sends. It never sends commands, never arms/disarms and never programs the panel.

Panel settings (56.4.2.6 A.Monitor): IP = Home Assistant IP, Port = 10002, Account = 000001.

Home Assistant receives:
- event `galaxy_event` (data: seq, raw, sender, time)
- entity `sensor.galaxy_last_event`
