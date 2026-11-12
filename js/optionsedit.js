/* ════════════════════════════════════════════════════════════════
   N MARKET — éditeur d'options / suppléments d'un produit (côté vendeur)
   Un « groupe » = une question posée au client :
     · Choix unique   → taille, couleur, pointure… (le client en choisit UN)
     · Plusieurs choix → suppléments / compléments (le client coche ce qu'il veut)
   Chaque choix peut avoir un prix en plus (0 = gratuit).
   Le serveur revalide tout et recalcule les prix : ce formulaire ne fait qu'aider à saisir.
════════════════════════════════════════════════════════════════ */
const OE_PRESETS = {
  taille:  { name: 'Taille',    type: 'single', required: true,  choices: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
  pointure:{ name: 'Pointure',  type: 'single', required: true,  choices: ['38', '39', '40', '41', '42', '43', '44'] },
  couleur: { name: 'Couleur',   type: 'single', required: true,  choices: ['Noir', 'Blanc', 'Bleu', 'Rouge', 'Vert'] },
  supp:    { name: 'Suppléments', type: 'multi', required: false, choices: [''] },
  autre:   { name: '',          type: 'single', required: false, choices: ['', ''] }
};

function createOptionsEditor(root) {
  let groups = [];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function render() {
    root.innerHTML = `
      <div class="oe-presets" role="group" aria-label="Ajouter une option">
        <button type="button" class="oe-add" data-preset="taille">+ Taille</button>
        <button type="button" class="oe-add" data-preset="pointure">+ Pointure</button>
        <button type="button" class="oe-add" data-preset="couleur">+ Couleur</button>
        <button type="button" class="oe-add oe-add-supp" data-preset="supp">+ Suppléments</button>
        <button type="button" class="oe-add" data-preset="autre">+ Autre</button>
      </div>
      <div class="oe-list">${groups.map((g, gi) => `
        <div class="oe-group" data-g="${gi}">
          <div class="oe-head">
            <input class="oe-name" data-f="name" maxlength="40" placeholder="Nom (ex : Taille, Couleur, Broderie…)" value="${esc(g.name)}" aria-label="Nom de l'option">
            <button type="button" class="oe-del" data-act="delg" title="Supprimer cette option" aria-label="Supprimer cette option">🗑</button>
          </div>
          <div class="oe-meta">
            <select class="oe-type" data-f="type" aria-label="Type">
              <option value="single" ${g.type === 'single' ? 'selected' : ''}>Un seul choix (taille, couleur…)</option>
              <option value="multi" ${g.type === 'multi' ? 'selected' : ''}>Plusieurs choix (suppléments)</option>
            </select>
            <label class="oe-req"><input type="checkbox" data-f="required" ${g.required ? 'checked' : ''}> Obligatoire</label>
          </div>
          <div class="oe-choices">${g.choices.map((c, ci) => `
            <div class="oe-choice" data-c="${ci}">
              <input class="oe-label" data-f="label" maxlength="40" placeholder="${g.type === 'multi' ? 'Ex : Broderie' : 'Ex : M'}" value="${esc(c.label)}" aria-label="Choix">
              <span class="oe-plus">+</span><input class="oe-price" data-f="price" type="number" inputmode="numeric" min="0" step="1" placeholder="0" value="${c.price ? Number(c.price) : ''}" aria-label="Prix en plus (FCFA)"><span class="oe-cur">FCFA</span>
              <button type="button" class="oe-del" data-act="delc" title="Retirer ce choix" aria-label="Retirer ce choix">✕</button>
            </div>`).join('')}
          </div>
          <button type="button" class="oe-addc" data-act="addc">+ Ajouter un choix</button>
        </div>`).join('')}
      </div>
      ${groups.length ? '' : '<p class="oe-empty">Aucune option. Ajoute une taille, une couleur ou des suppléments si ton produit en a besoin : le client les choisira avant de commander, et le prix s\'ajuste tout seul.</p>'}`;
  }

  root.addEventListener('click', e => {
    const preset = e.target.closest('[data-preset]');
    if (preset) {
      const t = OE_PRESETS[preset.dataset.preset];
      groups.push({ name: t.name, type: t.type, required: t.required, choices: t.choices.map(l => ({ label: l, price: 0 })) });
      render();
      const last = root.querySelectorAll('.oe-group'); const el = last[last.length - 1];
      if (el && !t.name) el.querySelector('.oe-name').focus();
      return;
    }
    const act = e.target.closest('[data-act]'); if (!act) return;
    const gEl = act.closest('.oe-group'); const gi = +gEl.dataset.g;
    if (act.dataset.act === 'delg') { groups.splice(gi, 1); render(); }
    else if (act.dataset.act === 'addc') { groups[gi].choices.push({ label: '', price: 0 }); render(); const rows = root.querySelectorAll(`.oe-group[data-g="${gi}"] .oe-label`); rows[rows.length - 1].focus(); }
    else if (act.dataset.act === 'delc') { const ci = +act.closest('.oe-choice').dataset.c; groups[gi].choices.splice(ci, 1); render(); }
  });
  function sync(e) {
    const f = e.target.dataset && e.target.dataset.f; if (!f) return;
    const gEl = e.target.closest('.oe-group'); if (!gEl) return;
    const g = groups[+gEl.dataset.g];
    if (f === 'name') g.name = e.target.value;
    else if (f === 'type') g.type = e.target.value;
    else if (f === 'required') g.required = e.target.checked;
    else { const c = g.choices[+e.target.closest('.oe-choice').dataset.c]; if (f === 'label') c.label = e.target.value; else c.price = Math.max(0, Math.floor(Number(e.target.value) || 0)); }
  }
  root.addEventListener('input', sync); root.addEventListener('change', sync);

  return {
    set(list) {
      groups = (Array.isArray(list) ? list : []).map(g => ({ name: g.name || '', type: g.type === 'multi' ? 'multi' : 'single', required: !!g.required,
        choices: (g.choices || []).map(c => ({ label: c.label || '', price: Number(c.price) || 0 })) }));
      render();
    },
    /* renvoie la liste propre, ou lève une Error(message lisible) */
    get() {
      const out = [];
      groups.forEach(g => {
        const name = g.name.trim();
        const choices = g.choices.map(c => ({ label: c.label.trim(), price: Math.max(0, Math.floor(Number(c.price) || 0)) })).filter(c => c.label);
        if (!name && !choices.length) return;                    // ligne vide ignorée
        if (!name) throw new Error('Donne un nom à chaque option (ex : Taille).');
        if (!choices.length) throw new Error(`Ajoute au moins un choix à « ${name} ».`);
        if (out.some(o => o.name.toLowerCase() === name.toLowerCase())) throw new Error(`Deux options s'appellent « ${name} ».`);
        const seen = new Set(); choices.forEach(c => { const k = c.label.toLowerCase(); if (seen.has(k)) throw new Error(`« ${c.label} » est en double dans « ${name} ».`); seen.add(k); });
        out.push({ name, type: g.type, required: !!g.required, choices });
      });
      if (out.length > 8) throw new Error('Maximum 8 options par produit.');
      return out;
    }
  };
}
