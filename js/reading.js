import { bootModule } from "./runner_common.js";
bootModule({ moduleName: "reading", manifestPath: "../data/manifest.json" })
  .catch(err => {
    console.error(err);
    document.body.innerHTML = `<div class="container"><div class="card"><h2>Error</h2><pre>${err.message}</pre></div></div>`;
  });
