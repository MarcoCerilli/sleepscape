# SleepScape

MVP per creare ambienti sonori con mixer, scenari, timer, sveglia ambientale e mix salvati sul dispositivo.

Richiede Node.js 20 o successivo e npm. Dalla cartella principale:

```bash
npm install
npm run dev
```

Apri http://localhost:3000.

```bash
npm run typecheck
npm run build
npm start
```

Premi **Avvia ambiente** per abilitare l'audio. Il timer accetta da 1 a 480 minuti e può essere annullato. La sveglia è valida per la prossima occorrenza dell'orario scelto e richiede la pagina attiva: i browser mobili possono sospendere audio e timer in background.

Il service worker è abilitato solo nella build di produzione, per evitare pagine obsolete durante lo sviluppo. Le descrizioni sono interpretate localmente, senza servizi AI o account esterni.

## Deploy su Render

SleepScape è configurato come **Static Site** (100% gratuito su Render, zero costi, zero cold-starts):

1. Collega il repository GitHub su [dashboard.render.com](https://dashboard.render.com).
2. Seleziona **New +** > **Static Site** (oppure usa il file `render.yaml` con **Blueprint**).
3. Imposta i seguenti parametri:
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `out`
4. Clicca su **Create Static Site**.

