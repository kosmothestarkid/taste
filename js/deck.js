/* ============================================================
   TASTE — THE DECK
   Every profile is a playing card: photo in an arched window,
   the first letter of the name in the corners where J/Q/K would
   sit, gold frame on cream paper. Tap flips the card (3D) to its
   indigo-and-gold back, then opens that person's taste page.
   ============================================================ */

import { profiles } from './db.js';
import { esc } from './render-taste.js';

function cardHtml(p) {
  const letter = esc((p.name || '?').trim().charAt(0).toUpperCase());
  const photo = p.image
    ? `<img class="card-photo" src="${esc(p.image)}" alt="${esc(p.name)}">`
    : `<div class="card-photo" style="display:grid;place-items:center;font-family:var(--font-heading);font-size:2.6rem;" aria-hidden="true"><span class="foil">${letter}</span></div>`;
  return `
    <li class="card-slot">
      <button class="card" data-profile="${esc(p.id)}" aria-label="Open ${esc(p.name)}'s taste">
        <span class="card-face card-front">
          <span class="card-corner tl"><span class="rank foil">${letter}</span><span class="pip">✦</span></span>
          ${photo}
          <span class="card-name">${esc(p.name)}</span>
          <span class="card-corner br"><span class="rank foil">${letter}</span><span class="pip">✦</span></span>
        </span>
        <span class="card-face card-back">
          <span class="monogram foil">${letter}</span>
          <span class="open-hint">✦ taste ✦</span>
        </span>
      </button>
    </li>`;
}

export function deckHtml() {
  const cards = profiles().map(cardHtml).join('');
  return `
    <header class="deck-intro">
      <h1 class="foil">The Deck</h1>
      <p>Tap a card to flip it and step through their doors.</p>
    </header>
    <ul class="deck-grid">${cards}</ul>`;
}

export function wireDeck(root) {
  root.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('click', () => {
      if (card.classList.contains('flipped')) return;
      card.classList.add('flipped');
      // Let the flip play, then open the taste page.
      setTimeout(() => {
        location.hash = '#/taste/' + card.dataset.profile;
      }, 620);
    });
  });
}
