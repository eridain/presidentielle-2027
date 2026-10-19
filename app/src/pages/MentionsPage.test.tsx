// Mentions : champs éditoriaux vides jamais affichés (« non renseigné », « à compléter ») ; « usage personnel » si aucun
// champ n'est renseigné ; la configuration publique (src/config.ts) affiche éditeur, contact et hébergeur.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SITE } from '../config';
import { Edition, USAGE_PERSONNEL } from './MentionsPage';

const VIDE = { editeur: null, contact: null, hebergeur: null };

describe('mentions : éditeur et hébergement', () => {
  it('aucun champ renseigné : message neutre « Site à usage personnel. »', () => {
    for (const site of [VIDE, { editeur: '', contact: '  ', hebergeur: null }]) {
      const html = renderToStaticMarkup(<Edition site={site} />);
      expect(html).toBe(`<p>${USAGE_PERSONNEL}</p>`);
      expect(html).not.toMatch(/renseign|compléter|undefined|null/);
    }
    expect(USAGE_PERSONNEL).toBe('Site à usage personnel.');
  });

  it('seuls les champs renseignés sont listés', () => {
    const html = renderToStaticMarkup(<Edition site={{ ...VIDE, contact: 'contact@example.fr' }} />);
    expect(html).toBe('<ul class="edition"><li>Contact : <a href="mailto:contact@example.fr">contact@example.fr</a></li></ul>');
    const tous = renderToStaticMarkup(<Edition site={{ editeur: 'Association X', contact: 'https://www.example.fr/contact', hebergeur: 'Hébergeur Y' }} />);
    expect(tous.match(/<li>/g)).toHaveLength(3);
    expect(tous).toContain('target="_blank"');
  });

  it('configuration publique : éditeur, contact (lien mailto) et hébergeur affichés, jamais « usage personnel »', () => {
    const html = renderToStaticMarkup(<Edition />);
    expect(html).toBe(renderToStaticMarkup(<Edition site={SITE} />));
    expect(html.match(/<li>/g)).toHaveLength(3);
    expect(html).toContain('<li>Éditeur\u00a0: eridain</li>');
    expect(html).toContain('<li>Contact\u00a0: <a href="mailto:aerdannq@gmail.com">aerdannq@gmail.com</a></li>');
    expect(html).toContain('Hébergeur\u00a0: GitHub Pages — GitHub, Inc.');
    expect(html).not.toContain(USAGE_PERSONNEL);
    expect(SITE.contactRectification).toBe('aerdannq@gmail.com');
  });
});
