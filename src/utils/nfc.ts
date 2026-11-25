import QRCode from 'qrcode';

export interface WebNfcSupport {
  supported: boolean;
  message: string;
}

export function checkWebNfcSupport(): WebNfcSupport {
  if (typeof window !== 'undefined' && 'NDEFReader' in window) {
    return {
      supported: true,
      message: 'Web NFC is supported on this browser (Chrome on Android). You can write directly to digital cards!'
    };
  }
  return {
    supported: false,
    message: 'Web NFC requires Google Chrome on an NFC-enabled Android phone. For iOS or PC, you can copy the URL into NFC Tools app.'
  };
}

export async function writeNfcUrlPayload(url: string): Promise<{ success: boolean; message: string; serialNumber?: string }> {
  if (typeof window === 'undefined' || !('NDEFReader' in window)) {
    return {
      success: false,
      message: 'Web NFC API is not available on this device/browser. Use NFC Tools app on your smartphone.'
    };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ndef = new (window as any).NDEFReader();
    await ndef.write({
      records: [
        {
          recordType: 'url',
          data: url,
        }
      ]
    });

    return {
      success: true,
      message: 'Successfully programmed digital card with menu URL!'
    };
  } catch (error: unknown) {
    const err = error as Error;
    return {
      success: false,
      message: `NFC Write error: ${err.message || 'Operation cancelled or tag not found'}`
    };
  }
}

export async function generateQrDataUrl(url: string, colorDark = '#18181b'): Promise<string> {
  try {
    return await QRCode.toDataURL(url, {
      width: 400,
      margin: 2,
      color: {
        dark: colorDark,
        light: '#ffffff'
      },
      errorCorrectionLevel: 'M'
    });
  } catch (err) {
    console.error('Failed to generate QR code', err);
    return '';
  }
}

/**
 * Generates an ultra-crisp, high-resolution QR code data URL (1024x1024)
 * with High error-correction ('H') for physical printing on table stands,
 * stickers, and acrylic displays. 100% offline and zero network dependency.
 */
export async function generateHighResQrDataUrl(url: string, width = 1024, colorDark = '#111827'): Promise<string> {
  try {
    return await QRCode.toDataURL(url, {
      width,
      margin: 2,
      color: {
        dark: colorDark,
        light: '#ffffff'
      },
      errorCorrectionLevel: 'H'
    });
  } catch (err) {
    console.error('Failed to generate high-resolution QR code', err);
    return '';
  }
}
