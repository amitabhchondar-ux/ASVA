export type LandingPageCustomization = {
  css?: string;
  primaryColor?: string;
  headingFont?: string;
  bodyFont?: string;
  headingWeight?: string;
  bodyWeight?: string;
  headingSize?: number;
  bodySize?: number;
  headingLetterSpacing?: number;
};

export type PageTypographyProps = {
  headingFont?: string;
  bodyFont?: string;
  headingWeight?: string;
  bodyWeight?: string;
  primaryColor?: string;
  headingSize?: number;
  bodySize?: number;
  headingLetterSpacing?: number;
};

export function splitTypographyProps<T extends Record<string, any>>(props: T): [PageTypographyProps, Omit<T, keyof PageTypographyProps>] {
  const {
    headingFont,
    bodyFont,
    headingWeight,
    bodyWeight,
    primaryColor,
    headingSize,
    bodySize,
    headingLetterSpacing,
    ...rest
  } = props;
  return [
    {
      headingFont,
      bodyFont,
      headingWeight,
      bodyWeight,
      primaryColor,
      headingSize,
      bodySize,
      headingLetterSpacing,
    },
    rest as Omit<T, keyof PageTypographyProps>,
  ];
}

export function usePageTypography(recipe: any, overrides?: PageTypographyProps): LandingPageCustomization {
  return {
    ...recipe,
    ...overrides,
  };
}

export function applyPageCustomization(frame: HTMLIFrameElement | null, customization?: LandingPageCustomization) {
  if (!frame || !customization) return;
  try {
    const doc = frame.contentDocument;
    if (!doc) return;

    let style = doc.getElementById('threeui-page-customization') as HTMLStyleElement | null;
    if (!style) {
      style = doc.createElement('style');
      style.id = 'threeui-page-customization';
      doc.head.appendChild(style);
    }

    const rules: string[] = [];
    if (customization.primaryColor) {
      rules.push(`:root { --accent: ${customization.primaryColor} !important; }`);
    }
    if (customization.headingFont) {
      rules.push(`:root { --serif: "${customization.headingFont}", serif !important; }`);
    }
    if (customization.bodyFont) {
      rules.push(`:root { --mono: "${customization.bodyFont}", sans-serif !important; }`);
    }
    if (customization.headingSize) {
      rules.push(`.hero-word { font-size: ${customization.headingSize * 2}px !important; }`);
    }
    if (customization.headingLetterSpacing !== undefined) {
      rules.push(`.hero-word, .identity__name { letter-spacing: ${customization.headingLetterSpacing}em !important; }`);
    }

    style.textContent = rules.join('\n');
  } catch (err) {
    // Cross-origin iframe guard
  }
}

export function postPageCustomization(frame: HTMLIFrameElement | null, customization?: LandingPageCustomization) {
  if (!frame || !customization) return;
  try {
    frame.contentWindow?.postMessage({
      type: 'threeui-customization',
      customization,
    }, '*');
  } catch (err) {
    // PostMessage guard
  }
}

