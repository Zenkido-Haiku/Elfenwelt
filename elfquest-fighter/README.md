# Elfquest-Fighter II Turbo

Verschlüsselter Spieleinstieg. Das Passwort wird weder gespeichert noch an GitHub gesendet. Die Spieldaten sind mit AES-256-GCM verschlüsselt; der Schlüssel wird lokal aus dem Passwort mit PBKDF2-SHA-256 abgeleitet.

Die Adresse und verschlüsselten Dateien sind öffentlich abrufbar. Nur mit dem Passwort lässt sich das Spiel öffnen. Berechtigte Spieler können Inhalte nach dem Entschlüsseln kopieren und das Passwort weitergeben.

## Version 0.12.1

Verbesserte sichtbare Trefferkontakte, zehn abgestufte Gegnerprofile und geringerer Zeichen- und Speicheraufwand. Ein zusätzlich verschlüsseltes Update ergänzt die unveränderte Basis. Beide Teile werden vor dem Start authentifiziert und der vollständige Spielinhalt gegen SHA-256 geprüft.
