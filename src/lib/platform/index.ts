export interface PlatformServices {
  pickFile(): Promise<File[]>;
  takePhoto(): Promise<File>;
  share(payload: { title?: string; text?: string; url?: string }): Promise<void>;
  isOnline(): boolean;
}

export function getPlatformServices(): PlatformServices {
  return new WebPlatformServices();
}

class WebPlatformServices implements PlatformServices {
  async pickFile(): Promise<File[]> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = 'image/*,.pdf,.md,.txt,.docx,.pptx';
      input.onchange = () => {
        resolve(Array.from(input.files || []));
      };
      input.click();
    });
  }

  async takePhoto(): Promise<File> {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment';
      input.onchange = () => {
        const file = input.files?.[0];
        if (file) resolve(file);
        else reject(new Error('No photo taken'));
      };
      input.click();
    });
  }

  async share(payload: { title?: string; text?: string; url?: string }): Promise<void> {
    if (navigator.share) {
      await navigator.share(payload);
    } else {
      await navigator.clipboard.writeText(payload.text || payload.url || '');
    }
  }

  isOnline(): boolean {
    return navigator.onLine;
  }
}
