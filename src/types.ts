export type CreationMethod = 'digital' | 'ai-assisted' | 'ai-generated' | 'other';
export type LicenseType = 'personal' | 'commercial' | 'exclusive' | 'transfer';
export type PageSize = 'letter' | 'a4';

export interface EmbeddedImage {
  bytes: Uint8Array;
  kind: 'png' | 'jpg';
}

export interface RightsForm {
  certificateId: string;
  issueDate: string;
  pageSize: PageSize;
  artwork: {
    title: string;
    edition: string;
    dateCreated: string;
    medium: string;
    dimensions: string;
    description: string;
    creationMethod: CreationMethod;
    toolsUsed: string;
    fileName: string;
    fileHash: string;
    preview?: EmbeddedImage;
  };
  artist: {
    name: string;
    alias: string;
    email: string;
    website: string;
  };
  recipient: {
    name: string;
    organization: string;
    email: string;
  };
  license: {
    type: LicenseType;
    permissions: string[];
    prohibitions: string[];
    territory: string;
    term: string;
    attribution: string;
    additionalTerms: string;
  };
  signature: {
    typedName: string;
    drawn?: EmbeddedImage;
  };
  /** Logo shown in the "brought to you by" note at the bottom of the last page. */
  brandLogo?: EmbeddedImage;
}

export const CREATION_METHODS: Record<CreationMethod, string> = {
  digital: 'Created by the artist (no generative AI)',
  'ai-assisted': 'AI-assisted: created by the artist with the help of generative AI tools',
  'ai-generated': "AI-generated: generated with AI tools under the artist's direction",
  other: 'Other',
};

export const LICENSE_TYPES: Record<LicenseType, string> = {
  personal: 'Personal, non-commercial license',
  commercial: 'Non-exclusive commercial license',
  exclusive: 'Exclusive commercial license',
  transfer: 'Full copyright assignment',
};

export const PERMISSIONS: Record<string, string> = {
  display: 'Display the artwork publicly, online and in physical spaces',
  print: 'Make physical prints and reproductions',
  modify: 'Crop, edit, or create derivative works using conventional software and tools',
  'modify-ai': 'Edit or create derivative works using artificial intelligence (AI) tools',
  commercial: 'Use in commercial products, marketing, or advertising',
  resell: 'Resell or transfer this license to another party',
  sublicense: 'Grant sublicenses to third parties',
};

export const PROHIBITIONS: Record<string, string> = {
  'ai-training': 'Use the artwork to train or fine-tune AI / machine-learning models',
  nft: 'Mint, tokenize, or sell the artwork as an NFT',
  trademark: 'Use the artwork as a trademark, logo, or brand identity',
  sensitive: 'Use the artwork in defamatory, hateful, or unlawful content',
};

/** Default checkbox state applied when the license type changes. */
export const LICENSE_PRESETS: Record<LicenseType, { permissions: string[]; prohibitions: string[] }> = {
  personal: { permissions: ['display', 'print'], prohibitions: ['ai-training', 'nft', 'trademark', 'sensitive'] },
  commercial: { permissions: ['display', 'print', 'modify', 'commercial'], prohibitions: ['ai-training', 'nft', 'trademark', 'sensitive'] },
  exclusive: { permissions: ['display', 'print', 'modify', 'commercial', 'sublicense'], prohibitions: ['ai-training', 'sensitive'] },
  transfer: { permissions: Object.keys(PERMISSIONS), prohibitions: [] },
};
