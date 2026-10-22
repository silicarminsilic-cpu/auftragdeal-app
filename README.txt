auftragdeal.ch – Dashboard (Node.js)  ·  Admin · Partner-Portal · Lead-Markt · Kundenportal
===========================================================================================

INFOMANIAK-FORMULAR "Node.js" (so ausfüllen)
  Build-Befehl ........ npm install
  Ausführungsbefehl ... npm start
  Empfangsport ........ 3000
  Node-Version ........ 22 (oder neueste verfügbare; mindestens 20)

DATEIEN HOCHLADEN
  Den gesamten Inhalt dieses Ordners (server.js, package.json, config.json, Ordner lib) ins Stammverzeichnis
  der Node.js-Site hochladen (FTP oder ZIP). NICHT hochladen: node_modules, data (werden automatisch erstellt).

ERSTE INBETRIEBNAHME
  1. Site starten/bereitstellen (Build läuft: npm install).
  2. https://app.auftragdeal.ch/install.php öffnen.
     Setup-Code: steht in config.json bei "setup_code" (SETUP-405f720f1f944076). Admin-Name, E-Mail, Passwort (mind. 10 Zeichen).
  3. Danach: Einstellungen im Admin → Bankverbindung (IBAN), Preise pro Branche, Stripe-Beträge.

E-MAIL-VERSAND (damit Bestätigungs- und Einladungsmails ankommen)
  Datei config.local.json im Hauptordner anlegen (Vorlage: config.local.json.example):
    smtp_user = anfrage@auftragdeal.ch,  smtp_pass = Passwort dieses Postfachs,  smtp_host = mail.infomaniak.com, Port 465.
  Alternativ als Umgebungsvariablen: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS.
  Ohne SMTP-Zugang funktioniert alles, aber es werden KEINE Mails gesendet (der Admin sieht Zugangslinks direkt im Dashboard).
  Das Passwort gehört nur auf den Server – nie in Chat, GitHub oder Mail.

STRIPE
  Webhook-URL:  https://app.auftragdeal.ch/api/stripe.php   Ereignis: checkout.session.completed
  Das Signing-Secret (whsec_...) in config.local.json ("stripe_webhook_secret") oder Variable STRIPE_WEBHOOK_SECRET eintragen.
  Zahlungslinks sind in config.json hinterlegt; Beträge der Buttons im Admin unter Einstellungen setzen.

DATENBANK UND BACKUP
  Die Daten liegen in data/app.sqlite (wird automatisch angelegt). Pfad änderbar: Variable DB_PATH oder "db_path".
  WICHTIG: Bei einem erneuten Hochladen/Build darf der Ordner data nicht überschrieben werden.
  Im Admin unter Einstellungen → "Datenbank-Backup laden" regelmässig (z. B. wöchentlich) eine Sicherung herunterladen.
  Treiber: eingebautes node:sqlite (Node 22+) oder automatisch better-sqlite3 (Node 20).

URLS (unverändert zur PHP-Version)
  /index.php?p=login   Anmelden        /index.php?p=register   Firma registriert sich
  /install.php         Einrichtung     /api/register.php  /api/request.php  /api/stripe.php

FUNKTIONEN: wie die PHP-Version – Lead-Markt (Branche + PLZ-Filter, max. 3 Käufer, Exklusiv, Preisnachlass, Ablauf),
  Guthaben (Überweisung, Stripe, Kreditlimite, Gratis-Leads), Reklamationen mit Rückerstattung, Direktangebote,
  CRM, Offerten/Rechnungen (Druck/PDF), Admin: Firmen, Leads, Benutzer, Finanzen, CSV-Export, Protokoll, Einstellungen.
  Sicherheit: gehashte Passwörter (scrypt), CSRF-Schutz, Login-/Registrierungs-Sperren, Kauf in Datenbank-Transaktion.
