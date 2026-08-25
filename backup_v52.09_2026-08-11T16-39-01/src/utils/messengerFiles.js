export const MESSENGER_STORAGE_BUCKET = 'messenger-files';
export const MESSENGER_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MESSENGER_IMAGE_TARGET_BYTES = 2 * 1024 * 1024;
export const MESSENGER_IMAGE_MAX_DIMENSION = 1920;

const pad = (value) => String(value).padStart(2, '0');

const getKoreaParts = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = {};
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(date)
    .forEach((part) => {
      if (part.type !== 'literal') {
        parts[part.type] = Number(part.value);
      }
    });

  return parts;
};

export const formatMessengerDateTime = (value) => {
  const parts = getKoreaParts(value);
  if (!parts) return '-';

  return `${String(parts.year).slice(2)}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}`;
};

export const formatMessengerRoomTime = (value) => {
  const target = getKoreaParts(value);
  if (!target) return '';

  const today = getKoreaParts(new Date());
  const isToday =
    target.year === today?.year &&
    target.month === today?.month &&
    target.day === today?.day;

  if (isToday) {
    return `${pad(target.hour)}:${pad(target.minute)}`;
  }

  return `${String(target.year).slice(2)}-${pad(target.month)}-${pad(target.day)}`;
};

export const formatMessengerFileSize = (bytes) => {
  const size = Number(bytes || 0);
  if (!Number.isFinite(size) || size <= 0) return '0 B';
  if (size < 1024) return `${size.toLocaleString()} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

export const sanitizeMessengerFileName = (fileName = 'file') => {
  const normalized = String(fileName || 'file')
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 120);

  return normalized || 'file';
};

export const buildMessengerStoragePath = ({
  roomId,
  userId,
  fileName,
}) => {
  const randomId =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `${roomId}/${userId}/${Date.now()}-${randomId}-${sanitizeMessengerFileName(fileName)}`;
};

const loadImageSource = async (file) => {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close?.(),
    };
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        cleanup: () => URL.revokeObjectURL(url),
      });
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('이미지 파일을 읽지 못했습니다.'));
    };

    image.src = url;
  });
};

const canvasToBlob = (canvas, type, quality) =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('이미지 압축에 실패했습니다.'));
          return;
        }
        resolve(blob);
      },
      type,
      quality,
    );
  });

const getImageOutputName = (fileName) => {
  const safeName = sanitizeMessengerFileName(fileName);
  const dotIndex = safeName.lastIndexOf('.');
  const baseName = dotIndex > 0 ? safeName.slice(0, dotIndex) : safeName;
  return `${baseName || 'image'}.jpg`;
};

export const prepareMessengerFile = async (originalFile) => {
  if (!(originalFile instanceof File)) {
    throw new Error('전송할 파일을 확인해주세요.');
  }

  const originalIsImage = String(originalFile.type || '').startsWith('image/');
  const isNonCompressibleImage = ['image/gif', 'image/svg+xml'].includes(
    String(originalFile.type || '').toLowerCase(),
  );

  let imageWidth = null;
  let imageHeight = null;

  if (!originalIsImage || isNonCompressibleImage) {
    if (originalFile.size > MESSENGER_MAX_FILE_BYTES) {
      throw new Error('파일은 10MB 이하만 전송할 수 있습니다.');
    }

    return {
      file: originalFile,
      messageType: originalIsImage ? 'image' : 'file',
      imageWidth,
      imageHeight,
      compressed: false,
    };
  }

  let loadedImage = null;

  try {
    try {
      loadedImage = await loadImageSource(originalFile);
    } catch (decodeError) {
      if (originalFile.size > MESSENGER_MAX_FILE_BYTES) {
        throw new Error('이미지 파일은 10MB 이하만 전송할 수 있습니다.');
      }

      // HEIC처럼 현재 브라우저가 미리보기/압축을 지원하지 않는 이미지는
      // 원본을 일반 파일 형태로 전송해 손실 없이 다운로드할 수 있게 한다.
      console.warn('브라우저에서 이미지 압축을 지원하지 않아 원본 파일로 전송합니다:', decodeError);
      return {
        file: originalFile,
        messageType: 'file',
        imageWidth: null,
        imageHeight: null,
        compressed: false,
      };
    }

    imageWidth = loadedImage.width;
    imageHeight = loadedImage.height;

    if (
      originalFile.size <= MESSENGER_IMAGE_TARGET_BYTES &&
      originalFile.size <= MESSENGER_MAX_FILE_BYTES
    ) {
      return {
        file: originalFile,
        messageType: 'image',
        imageWidth,
        imageHeight,
        compressed: false,
      };
    }

    const scale = Math.min(
      1,
      MESSENGER_IMAGE_MAX_DIMENSION / Math.max(imageWidth, imageHeight),
    );
    const outputWidth = Math.max(1, Math.round(imageWidth * scale));
    const outputHeight = Math.max(1, Math.round(imageHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;

    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      throw new Error('이미지 압축 기능을 사용할 수 없습니다.');
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, outputWidth, outputHeight);
    context.drawImage(loadedImage.source, 0, 0, outputWidth, outputHeight);

    const qualitySteps = [0.84, 0.76, 0.68, 0.6, 0.52];
    let outputBlob = null;

    for (const quality of qualitySteps) {
      outputBlob = await canvasToBlob(canvas, 'image/jpeg', quality);
      if (outputBlob.size <= MESSENGER_IMAGE_TARGET_BYTES) break;
    }

    if (!outputBlob) {
      throw new Error('이미지 압축에 실패했습니다.');
    }

    const compressedFile = new File(
      [outputBlob],
      getImageOutputName(originalFile.name),
      {
        type: 'image/jpeg',
        lastModified: Date.now(),
      },
    );

    const finalFile =
      compressedFile.size < originalFile.size ? compressedFile : originalFile;

    if (finalFile.size > MESSENGER_MAX_FILE_BYTES) {
      throw new Error('이미지를 압축해도 10MB를 초과하여 전송할 수 없습니다.');
    }

    return {
      file: finalFile,
      messageType: 'image',
      imageWidth:
        finalFile === compressedFile ? outputWidth : imageWidth,
      imageHeight:
        finalFile === compressedFile ? outputHeight : imageHeight,
      compressed: finalFile === compressedFile,
    };
  } finally {
    loadedImage?.cleanup?.();
  }
};
