/**
 * Merge Matrix — strings for the Graphics settings section, in every required
 * locale. The locale follows navigator.language (the game has no language
 * setting); unknown languages fall back to en-US.
 */
import type { DescribeWords } from './gfx.js';

export interface GfxText extends DescribeWords {
  quality: string; auto: string; low: string; balanced: string; high: string; ultra: string;
  renderScale: string; fromPreset: string; adaptive: string; showFps: string;
  postFailed: string; glOff: string; unknownGpu: string;
  cat: Record<string, string>;
  tier: Record<string, string>;
}

const enUS: GfxText = {
  quality: 'Quality', auto: 'Auto (detected: {tier})', low: 'Low', balanced: 'Balanced', high: 'High', ultra: 'Ultra',
  renderScale: 'Render scale', fromPreset: 'From preset ({tier})', adaptive: 'Adaptive resolution', showFps: 'Show frame rate',
  postFailed: 'Post-processing is unavailable on this device; the board renders without effects.',
  glOff: 'The 3D board is off; these options apply when it is on.', unknownGpu: 'unknown GPU',
  noShadows: 'no shadows', shadows: 'shadows', ao: 'ambient occlusion', aoHigh: 'full ambient occlusion', bloom: 'bloom', noAa: 'no anti-aliasing',
  cat: { shadows: 'Shadows', ao: 'Ambient occlusion', bloom: 'Bloom', grade: 'Color grade', antialias: 'Anti-aliasing', reflections: 'Reflections', detail: 'Tile detail', particles: 'Particles' },
  tier: { off: 'Off', on: 'On', low: 'Low', medium: 'Medium', high: 'High', fxaa: 'FXAA', smaa: 'SMAA', msaa: 'MSAA', plain: 'Plain', detailed: 'Detailed' },
};

const enGB: GfxText = {
  ...enUS,
  cat: { ...enUS.cat, grade: 'Colour grade' },
};

const es419: GfxText = {
  quality: 'Calidad', auto: 'Automática (detectada: {tier})', low: 'Baja', balanced: 'Equilibrada', high: 'Alta', ultra: 'Ultra',
  renderScale: 'Escala de renderizado', fromPreset: 'Según el ajuste ({tier})', adaptive: 'Resolución adaptativa', showFps: 'Mostrar cuadros por segundo',
  postFailed: 'El posprocesado no está disponible en este dispositivo; el tablero se muestra sin efectos.',
  glOff: 'El tablero 3D está desactivado; estas opciones se aplican cuando está activado.', unknownGpu: 'GPU desconocida',
  noShadows: 'sin sombras', shadows: 'sombras', ao: 'oclusión ambiental', aoHigh: 'oclusión ambiental completa', bloom: 'resplandor', noAa: 'sin antialiasing',
  cat: { shadows: 'Sombras', ao: 'Oclusión ambiental', bloom: 'Resplandor', grade: 'Corrección de color', antialias: 'Antialiasing', reflections: 'Reflejos', detail: 'Detalle de fichas', particles: 'Partículas' },
  tier: { off: 'Desactivado', on: 'Activado', low: 'Bajo', medium: 'Medio', high: 'Alto', fxaa: 'FXAA', smaa: 'SMAA', msaa: 'MSAA', plain: 'Simple', detailed: 'Detallado' },
};

const esES: GfxText = {
  ...es419,
  showFps: 'Mostrar fotogramas por segundo',
  renderScale: 'Escala de renderizado',
  glOff: 'El tablero 3D está desactivado; estas opciones se aplican cuando lo actives.',
};

const deDE: GfxText = {
  quality: 'Qualität', auto: 'Automatisch (erkannt: {tier})', low: 'Niedrig', balanced: 'Ausgewogen', high: 'Hoch', ultra: 'Ultra',
  renderScale: 'Renderskalierung', fromPreset: 'Aus Voreinstellung ({tier})', adaptive: 'Adaptive Auflösung', showFps: 'Bildrate anzeigen',
  postFailed: 'Nachbearbeitung ist auf diesem Gerät nicht verfügbar; das Spielfeld wird ohne Effekte dargestellt.',
  glOff: 'Das 3D-Spielfeld ist aus; diese Optionen gelten, wenn es eingeschaltet ist.', unknownGpu: 'unbekannte GPU',
  noShadows: 'keine Schatten', shadows: 'Schatten', ao: 'Umgebungsverdeckung', aoHigh: 'volle Umgebungsverdeckung', bloom: 'Bloom', noAa: 'keine Kantenglättung',
  cat: { shadows: 'Schatten', ao: 'Umgebungsverdeckung', bloom: 'Bloom', grade: 'Farbkorrektur', antialias: 'Kantenglättung', reflections: 'Spiegelungen', detail: 'Steindetails', particles: 'Partikel' },
  tier: { off: 'Aus', on: 'An', low: 'Niedrig', medium: 'Mittel', high: 'Hoch', fxaa: 'FXAA', smaa: 'SMAA', msaa: 'MSAA', plain: 'Einfach', detailed: 'Detailliert' },
};

const frFR: GfxText = {
  quality: 'Qualité', auto: 'Auto (détectée : {tier})', low: 'Basse', balanced: 'Équilibrée', high: 'Haute', ultra: 'Ultra',
  renderScale: 'Échelle de rendu', fromPreset: 'Selon le préréglage ({tier})', adaptive: 'Résolution adaptative', showFps: 'Afficher les images par seconde',
  postFailed: 'Le post-traitement est indisponible sur cet appareil ; le plateau s’affiche sans effets.',
  glOff: 'Le plateau 3D est désactivé ; ces options s’appliquent lorsqu’il est activé.', unknownGpu: 'GPU inconnu',
  noShadows: 'sans ombres', shadows: 'ombres', ao: 'occlusion ambiante', aoHigh: 'occlusion ambiante complète', bloom: 'halo lumineux', noAa: 'sans anticrénelage',
  cat: { shadows: 'Ombres', ao: 'Occlusion ambiante', bloom: 'Halo lumineux', grade: 'Étalonnage des couleurs', antialias: 'Anticrénelage', reflections: 'Reflets', detail: 'Détail des tuiles', particles: 'Particules' },
  tier: { off: 'Désactivé', on: 'Activé', low: 'Bas', medium: 'Moyen', high: 'Élevé', fxaa: 'FXAA', smaa: 'SMAA', msaa: 'MSAA', plain: 'Simple', detailed: 'Détaillé' },
};

const frCA: GfxText = {
  ...frFR,
  showFps: 'Afficher la fréquence d’images',
  renderScale: 'Échelle du rendu',
};

const ptBR: GfxText = {
  quality: 'Qualidade', auto: 'Automática (detectada: {tier})', low: 'Baixa', balanced: 'Equilibrada', high: 'Alta', ultra: 'Ultra',
  renderScale: 'Escala de renderização', fromPreset: 'Da predefinição ({tier})', adaptive: 'Resolução adaptativa', showFps: 'Mostrar taxa de quadros',
  postFailed: 'O pós-processamento não está disponível neste dispositivo; o tabuleiro é exibido sem efeitos.',
  glOff: 'O tabuleiro 3D está desligado; estas opções valem quando ele estiver ligado.', unknownGpu: 'GPU desconhecida',
  noShadows: 'sem sombras', shadows: 'sombras', ao: 'oclusão de ambiente', aoHigh: 'oclusão de ambiente completa', bloom: 'brilho', noAa: 'sem antisserrilhamento',
  cat: { shadows: 'Sombras', ao: 'Oclusão de ambiente', bloom: 'Brilho', grade: 'Correção de cor', antialias: 'Antisserrilhamento', reflections: 'Reflexos', detail: 'Detalhe dos blocos', particles: 'Partículas' },
  tier: { off: 'Desligado', on: 'Ligado', low: 'Baixo', medium: 'Médio', high: 'Alto', fxaa: 'FXAA', smaa: 'SMAA', msaa: 'MSAA', plain: 'Simples', detailed: 'Detalhado' },
};

const itIT: GfxText = {
  quality: 'Qualità', auto: 'Automatica (rilevata: {tier})', low: 'Bassa', balanced: 'Bilanciata', high: 'Alta', ultra: 'Ultra',
  renderScale: 'Scala di rendering', fromPreset: 'Dal preset ({tier})', adaptive: 'Risoluzione adattiva', showFps: 'Mostra frequenza fotogrammi',
  postFailed: 'La post-elaborazione non è disponibile su questo dispositivo; il tabellone viene mostrato senza effetti.',
  glOff: 'Il tabellone 3D è disattivato; queste opzioni valgono quando è attivo.', unknownGpu: 'GPU sconosciuta',
  noShadows: 'nessuna ombra', shadows: 'ombre', ao: 'occlusione ambientale', aoHigh: 'occlusione ambientale completa', bloom: 'bagliore', noAa: 'nessun antialiasing',
  cat: { shadows: 'Ombre', ao: 'Occlusione ambientale', bloom: 'Bagliore', grade: 'Correzione colore', antialias: 'Antialiasing', reflections: 'Riflessi', detail: 'Dettaglio tessere', particles: 'Particelle' },
  tier: { off: 'Disattivato', on: 'Attivo', low: 'Basso', medium: 'Medio', high: 'Alto', fxaa: 'FXAA', smaa: 'SMAA', msaa: 'MSAA', plain: 'Semplice', detailed: 'Dettagliato' },
};

export const GFX_LOCALES: Record<string, GfxText> = {
  'en-US': enUS, 'en-GB': enGB, 'es-419': es419, 'es-ES': esES, 'de-DE': deDE,
  'fr-FR': frFR, 'fr-CA': frCA, 'pt-BR': ptBR, 'it-IT': itIT,
};

/** Map a BCP 47 tag onto a supported locale (exact, then regional family, then language). */
export function pickLocale(tag: string | null | undefined): string {
  const t = String(tag || 'en-US');
  const exact = Object.keys(GFX_LOCALES).find((k) => k.toLowerCase() === t.toLowerCase());
  if (exact) return exact;
  const [lang, region = ''] = t.toLowerCase().split('-');
  if (lang === 'en') return ['gb', 'uk', 'ie', 'au', 'nz', 'in', 'za'].includes(region) ? 'en-GB' : 'en-US';
  if (lang === 'es') return region === 'es' ? 'es-ES' : 'es-419';
  if (lang === 'fr') return region === 'ca' ? 'fr-CA' : 'fr-FR';
  if (lang === 'de') return 'de-DE';
  if (lang === 'pt') return 'pt-BR';
  if (lang === 'it') return 'it-IT';
  return 'en-US';
}

export function gfxText(tag?: string): GfxText {
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'en-US';
  return GFX_LOCALES[pickLocale(tag ?? nav)];
}
