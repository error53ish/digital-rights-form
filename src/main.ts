import { generatePdf } from './pdf';
import {
  LICENSE_PRESETS,
  PERMISSIONS,
  PROHIBITIONS,
  type CreationMethod,
  type EmbeddedImage,
  type LicenseType,
  type PageSize,
  type RightsForm,
} from './types';
import { SignaturePad } from './signature';
import logoUrl from './assets/clawmark-logo.png';
import logoDarkUrl from './assets/clawmark-logo-dark.png';

const ARTIST_STORAGE_KEY = 'drf.artist';
const ARTIST_FIELDS = ['artistName', 'artistAlias', 'artistEmail', 'artistWebsite'] as const;

const $ = <T extends HTMLElement = HTMLInputElement>(id: string) => document.getElementById(id) as T;
const val = (id: string) => $<HTMLInputElement>(id).value.trim();

const form = $<HTMLFormElement>('rights-form');
const signaturePad = new SignaturePad($<HTMLCanvasElement>('signature-pad'));

// Fetched once and reused for every PDF.
const brandLogo: Promise<EmbeddedImage | undefined> = fetch(logoUrl)
  .then((r) => r.arrayBuffer())
  .then((b) => ({ bytes: new Uint8Array(b), kind: 'png' as const }))
  .catch(() => undefined);

let artworkFile: { name: string; hash: string; preview?: EmbeddedImage } | null = null;

// ---------- Certificate number ----------

function newCertificateId(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const random = crypto.getRandomValues(new Uint8Array(6));
  const suffix = Array.from(random, (b) => alphabet[b % alphabet.length]).join('');
  const date = today().replace(/-/g, '');
  return `COA-${date}-${suffix}`;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------- Checklists ----------

function renderChecklist(containerId: string, items: Record<string, string>, name: string) {
  const container = $<HTMLDivElement>(containerId);
  for (const [key, label] of Object.entries(items)) {
    const row = document.createElement('label');
    row.className = 'checkbox';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = name;
    input.value = key;
    row.append(input, ` ${label}`);
    container.append(row);
  }
}

function checked(name: string): string[] {
  return Array.from(form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]:checked`), (i) => i.value);
}

function applyLicensePreset(type: LicenseType) {
  const preset = LICENSE_PRESETS[type];
  form.querySelectorAll<HTMLInputElement>('input[name="permission"]').forEach((i) => {
    i.checked = preset.permissions.includes(i.value);
  });
  form.querySelectorAll<HTMLInputElement>('input[name="prohibition"]').forEach((i) => {
    i.checked = preset.prohibitions.includes(i.value);
  });
}

// ---------- Artwork file ----------

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Re-encodes any browser-decodable image as a downscaled JPEG for embedding. */
async function makePreview(file: File): Promise<EmbeddedImage | undefined> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return undefined; // not an image the browser can decode
  }
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!blob) return undefined;
  return { bytes: new Uint8Array(await blob.arrayBuffer()), kind: 'jpg' };
}

async function onArtworkSelected(file: File | undefined) {
  const info = $<HTMLDivElement>('file-info');
  const img = $<HTMLImageElement>('file-preview');
  if (!file) {
    artworkFile = null;
    info.hidden = true;
    return;
  }
  info.hidden = false;
  $('file-name').textContent = file.name;
  $('file-hash').textContent = 'Calculating…';
  img.hidden = true;

  const [hash, preview] = await Promise.all([sha256(file), makePreview(file)]);
  artworkFile = { name: file.name, hash, preview };
  $('file-hash').textContent = hash;
  if (preview) {
    if (img.src) URL.revokeObjectURL(img.src);
    img.src = URL.createObjectURL(new Blob([preview.bytes as BlobPart], { type: 'image/jpeg' }));
    img.hidden = false;
  }
  if (!val('title')) $('title').value = file.name.replace(/\.[^.]+$/, '');
}

// ---------- Artist persistence ----------

function loadArtist() {
  const saved = localStorage.getItem(ARTIST_STORAGE_KEY);
  if (!saved) return;
  try {
    const data = JSON.parse(saved) as Record<string, string>;
    for (const id of ARTIST_FIELDS) if (data[id]) $(id).value = data[id];
  } catch {
    localStorage.removeItem(ARTIST_STORAGE_KEY);
  }
}

function saveArtist() {
  if (!$('rememberArtist').checked) {
    localStorage.removeItem(ARTIST_STORAGE_KEY);
    return;
  }
  const data = Object.fromEntries(ARTIST_FIELDS.map((id) => [id, val(id)]));
  localStorage.setItem(ARTIST_STORAGE_KEY, JSON.stringify(data));
}

// ---------- Build + output ----------

async function collect(): Promise<RightsForm> {
  return {
    certificateId: val('certificateId'),
    issueDate: val('issueDate'),
    pageSize: val('pageSize') as PageSize,
    artwork: {
      title: val('title'),
      edition: val('edition'),
      dateCreated: val('dateCreated'),
      medium: val('medium'),
      dimensions: val('dimensions'),
      description: val('description'),
      creationMethod: val('creationMethod') as CreationMethod,
      toolsUsed: val('toolsUsed'),
      fileName: artworkFile?.name ?? '',
      fileHash: artworkFile?.hash ?? '',
      preview: artworkFile?.preview,
    },
    artist: {
      name: val('artistName'),
      alias: val('artistAlias'),
      email: val('artistEmail'),
      website: val('artistWebsite'),
    },
    recipient: {
      name: val('recipientName'),
      organization: val('recipientOrg'),
      email: val('recipientEmail'),
    },
    license: {
      type: val('licenseType') as LicenseType,
      permissions: checked('permission'),
      prohibitions: checked('prohibition'),
      territory: val('territory'),
      term: val('term'),
      attribution: val('attribution'),
      additionalTerms: val('additionalTerms'),
    },
    signature: {
      typedName: val('typedSignature') || val('artistName'),
      drawn: signaturePad.isEmpty ? undefined : { bytes: await signaturePad.toPng(), kind: 'png' },
    },
    brandLogo: await brandLogo,
  };
}

function validate(): string | null {
  const missing: string[] = [];
  if (!val('title')) missing.push('artwork title');
  if (!val('artistName')) missing.push("artist's legal name");
  if (!val('issueDate')) missing.push('issue date');
  return missing.length ? `Please fill in: ${missing.join(', ')}.` : null;
}

function fileNameFor(data: RightsForm): string {
  // Keep the title readable, but strip characters that aren't allowed in Windows/macOS file names.
  const title = data.artwork.title
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 80)
    .trim();
  return `${data.certificateId} - ${title || 'Untitled'}.pdf`;
}

async function buildPdf(): Promise<{ url: string; name: string } | null> {
  const errorEl = $<HTMLParagraphElement>('form-error');
  const error = validate();
  errorEl.hidden = !error;
  errorEl.textContent = error ?? '';
  if (error) return null;

  saveArtist();
  const data = await collect();
  try {
    const bytes = await generatePdf(data);
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return { url, name: fileNameFor(data) };
  } catch (err) {
    console.error(err);
    errorEl.hidden = false;
    errorEl.textContent = 'Something went wrong while creating the PDF. Check the console for details.';
    return null;
  }
}

// ---------- Theme ----------

const THEME_STORAGE_KEY = 'drf.theme';

function syncThemeToggle() {
  const dark = document.documentElement.dataset.theme === 'dark';
  const toggle = $<HTMLButtonElement>('theme-toggle');
  toggle.textContent = dark ? 'Light mode' : 'Dark mode';
  toggle.setAttribute('aria-pressed', String(dark));
  // The logo's lettering is black, so dark mode uses a variant with light lettering.
  for (const id of ['brand-logo', 'footer-logo']) $<HTMLImageElement>(id).src = dark ? logoDarkUrl : logoUrl;
}

$('theme-toggle').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem(THEME_STORAGE_KEY, next);
  syncThemeToggle();
});
syncThemeToggle();

// ---------- Wire up ----------

renderChecklist('permissions', PERMISSIONS, 'permission');
renderChecklist('prohibitions', PROHIBITIONS, 'prohibition');
applyLicensePreset('personal');
$('certificateId').value = newCertificateId();
$('issueDate').value = today();
loadArtist();

$('regenerate-id').addEventListener('click', () => ($('certificateId').value = newCertificateId()));
$('clear-signature').addEventListener('click', () => signaturePad.clear());
$('licenseType').addEventListener('change', () => applyLicensePreset(val('licenseType') as LicenseType));
$('creationMethod').addEventListener('change', () => {
  $('ai-note').hidden = val('creationMethod') !== 'ai-generated';
});
$('artworkFile').addEventListener('change', (e) => {
  void onArtworkSelected((e.target as HTMLInputElement).files?.[0]);
});

$('preview-pdf').addEventListener('click', async () => {
  const preview = window.open('', '_blank');
  const result = await buildPdf();
  if (result && preview) preview.location.href = result.url;
  else preview?.close();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const result = await buildPdf();
  if (!result) return;
  const a = document.createElement('a');
  a.href = result.url;
  a.download = result.name;
  a.click();
});
