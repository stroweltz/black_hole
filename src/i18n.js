/**
 * Internationalization (i18n) Module for Gargantua Black Hole Raytracer
 * Provides complete English and Russian localizations across all UI components,
 * telemetry HUD, toasts, modal windows, and drag-and-drop overlays.
 */

export const TRANSLATIONS = {
  en: {
    // Page Title & Meta
    pageTitle: 'Gargantua — Black Hole Simulation',

    // Preloader
    preloaderTitle: 'GARGANTUA',
    preloaderStatusInitial: 'Loading cosmic spacetime...',
    preloaderLoadingTextures: (loaded, total, percent) => `Loading cosmic textures... ${loaded} / ${total} MB (${percent}%)`,
    preloaderPreparingTextures: 'Preparing skybox textures...',
    preloaderCompilingShader: 'Compiling relativistic shaders...',
    preloaderReady: 'Ready for insertion',

    // Dropzone Overlay
    dropzoneTitle: '🌌 Drag and drop celestial panorama here',
    dropzoneSub: 'Supported formats: TIF, TIFF, JPG, PNG, WEBP, AVIF',

    // Header & Hint
    appTitle: 'GARGANTUA',
    appSubtitle: 'Supermassive Black Hole & Gravitational Lensing',
    controlsHint: '<strong>WASD</strong> — space flight • <strong>Hold LMB</strong> for 360° view • <strong>Shift</strong> — boost • <strong>Space / C</strong> — ascend / descend',

    // Telemetry HUD
    telemetryTitleKerr: 'TELEMETRY • KERR (INTERSTELLAR)',
    telemetryTitleSchw: 'TELEMETRY • SCHWARZSCHILD (STATIC)',
    telRadiusLabel: 'DISTANCE (r)',
    telShadowLabel: 'SKY SHADOW',
    telDilationLabel: 'TIME DILATION',

    // Time Dilation Units & Formatting
    dilationApproxHour: '(1h ≈ 1h)',
    dilationApproxHours: (g) => `(1h ≈ ${g}h)`,
    dilationApproxDays: (d) => `(1h ≈ ${d}d)`,
    dilationYears: (y) => `(1h = ${y} yrs)`,
    dilationEons: '(1h = eons)',
    numberLocale: 'en-US',

    // Top Right Actions
    btnToggleUiTitle: 'Hide/show control panel',
    btnToggleUiHide: 'Hide UI',
    btnToggleUiShow: 'Show UI',
    btnQuickAudioTitle: 'Toggle cosmic sound',
    btnQuickAudioOff: 'Sound',
    btnQuickAudioOn: 'Sound: On',
    btnLangToggleTitle: 'Switch language / Сменить язык (EN / RU)',

    // Camera Presets
    btnPresetOrbitTitle: "Miller's Planet Orbit (r = 5.6 Rs)",
    btnPresetOrbitText: 'Miller',
    btnPresetSphereTitle: 'Photon Sphere: 50% sky shadow (r = 1.50 Rs)',
    btnPresetSphereText: 'Photon Sphere',
    btnPresetPortalTitle: 'Horizon Edge (r = 1.015 Rs): the entire external Universe gathers into a radiant circular porthole overhead!',
    btnPresetPortalText: 'Universe Window',

    // Presets Toasts
    toastPresetRef: '🎥 Movie Framing (r = 15.2 Rs)',
    toastPresetOrbit: "🪐 Miller's Orbit (r = 5.6 Rs)",
    toastPresetSphere: '🌀 Photon Sphere (r = 1.50 Rs, 50% sky shadow)',
    toastPresetPortal: '🕳️ Horizon Edge (r = 1.015 Rs, 97.5% sky shadow)',

    // Metric Toggle & Toasts
    btnMetricTitle: 'Toggle Metric: Spinning Kerr hole (Interstellar) ↔ Static Schwarzschild hole',
    metricKerrText: 'Kerr (spinning)',
    metricSchwText: 'Schwarzschild (static)',
    toastMetricKerr: '🌀 Kerr Metric: spinning Gargantua (1 hr = 7 yrs on Miller)',
    toastMetricSchw: '⚫ Schwarzschild Metric: static non-rotating black hole',

    // Audio Controls & Toasts
    btnAudioTitle: 'Atmospheric NASA sonification sound (on/off)',
    btnAudioOff: 'Cosmic Sound',
    btnAudioOn: 'Sound: On',
    audioVolTitle: 'Audio volume',
    audioVolAria: 'Volume',
    audioInfoTitle: 'About audio & Chandra sonification',
    audioInfoAria: 'About audio',
    toastSoundOn: '🔊 Sound active. ⚠️ If experiencing nausea in headphones, use "Comfort Mode" in the ⓘ menu',
    toastSoundOff: '🔇 Sound muted',
    toastSoundLoading: 'Loading Perseus sonification (NASA)...',
    toastComfortOn: '🕊️ Comfort mode enabled (audio centered)',
    toastComfortOff: '🌀 Extreme relativistic Doppler enabled (may induce dizziness)',

    // Visual FX Buttons
    btnBloomTitle: 'Toggle bloom glow',
    btnBloomText: 'Glow',
    btnParticlesTitle: 'Toggle gravitationally lensed dust embers',
    btnParticlesText: 'Dust Embers',
    btnPlanetTitle: "Toggle Miller's planet",
    btnPlanetText: 'Planet',
    btnUploadBgTitle: 'Select custom celestial panorama image from computer',
    btnUploadBgText: 'Custom Skybox',
    btnUploadBgTextDone: 'Custom Skybox ✓',
    btnUploadBgLoaded: (name) => `Loaded panorama: ${name}`,

    // Speed & Fullscreen
    speedLabel: 'Speed:',
    btnFullscreenTitle: 'Fullscreen mode',
    btnFullscreenEnter: 'Fullscreen',
    btnFullscreenExit: 'Exit Fullscreen',
    toastFullscreenUnsupported: 'Fullscreen mode is not supported on this device',

    // Audio Modal
    audioModalHeading: 'About the Sound',
    audioModalCloseTitle: 'Close (Esc)',
    comfortLabelTitle: '🕊️ Comfort Mode (anti-nausea)',
    comfortModeDesc: 'Recommended for headphones: centers sound phase and disables asynchronous Doppler layers to eliminate dizziness and nausea. Uncheck to enable extreme relativistic Doppler.',
    audioWarningTitle: 'Vestibular Sensitivity Warning',
    audioWarningText: "NASA's sonification is generated from Perseus X-ray waves and contains deep sub-bass modulation (~58 Hz). In headphones, these can trigger motion sickness (vestibular illusion of rotation). Lower the volume or enable Comfort Mode if discomfort occurs.",
    btnLoadCustomAudio: 'Load Custom Track',
    audioSourceCustom: (fileName) => `Current source: Custom audio (${fileName})`,

    // Skybox & Audio File Ingestion Toasts
    toastSkyboxLoading: (name) => `Loading panorama: ${name}...`,
    toastTiffDecoding: (mb) => `Decoding TIFF (${mb} MB)...`,
    toastTiffIfdError: 'File does not contain valid IFD blocks',
    toastTiffSizeError: 'Could not determine TIFF image dimensions',
    toastTiffSuccess: (w, h) => `✓ TIFF panorama loaded: ${w}×${h}`,
    toastTiffError: (msg) => `❌ TIFF decoding error: ${msg}`,
    toastImgSuccess: (name) => `✓ Panorama loaded: ${name}`,
    toastImgError: '❌ Image loading error',
    toastAudioLoading: (name) => `Loading audio: ${name}...`,
    toastAudioSuccess: (name) => `✓ Audio loaded: ${name}`,
    toastAudioError: (msg) => `❌ Audio loading error: ${msg}`,

    // WebGL Fallback
    webglTitle: '⚫ WebGL Support Required',
    webglDesc: 'Your browser or graphics card does not currently support WebGL. Please enable hardware acceleration in your browser settings or update your GPU drivers.'
  },

  ru: {
    // Page Title & Meta
    pageTitle: 'Гаргантюа — Симуляция Чёрной Дыры',

    // Preloader
    preloaderTitle: 'ГАРГАНТЮА',
    preloaderStatusInitial: 'Загрузка космического пространства...',
    preloaderLoadingTextures: (loaded, total, percent) => `Загрузка текстур космоса... ${loaded} / ${total} МБ (${percent}%)`,
    preloaderPreparingTextures: 'Подготовка текстур неба...',
    preloaderCompilingShader: 'Инициализация релятивистского шейдера...',
    preloaderReady: 'Готово к погружению',

    // Dropzone Overlay
    dropzoneTitle: '🌌 Перетащите панораму сюда',
    dropzoneSub: 'Поддерживаются форматы: TIF, TIFF, JPG, PNG, WEBP, AVIF',

    // Header & Hint
    appTitle: 'ГАРГАНТЮА',
    appSubtitle: 'Сверхмассивная чёрная дыра и гравитационное линзирование',
    controlsHint: '<strong>WASD</strong> — полёт в космосе • <strong>Зажмите ЛКМ</strong> для обзора 360° • <strong>Shift</strong> — ускорение • <strong>Space / C</strong> — вверх / вниз',

    // Telemetry HUD
    telemetryTitleKerr: 'ТЕЛЕМЕТРИЯ • КЕРР (ИНТЕРСТЕЛЛАР)',
    telemetryTitleSchw: 'ТЕЛЕМЕТРИЯ • ШВАРЦШИЛЬД (СТАТИКА)',
    telRadiusLabel: 'РАССТОЯНИЕ (r)',
    telShadowLabel: 'ТЕНЬ НА НЕБЕ',
    telDilationLabel: 'ДИЛАТАЦИЯ ВРЕМЕНИ',

    // Time Dilation Units & Formatting
    dilationApproxHour: '(1ч ≈ 1ч)',
    dilationApproxHours: (g) => `(1ч ≈ ${g}ч)`,
    dilationApproxDays: (d) => `(1ч ≈ ${d}д)`,
    dilationYears: (y) => `(1ч = ${y} лет)`,
    dilationEons: '(1ч = века)',
    numberLocale: 'ru-RU',

    // Top Right Actions
    btnToggleUiTitle: 'Скрыть/показать панель управления',
    btnToggleUiHide: 'Скрыть интерфейс',
    btnToggleUiShow: 'Показать интерфейс',
    btnQuickAudioTitle: 'Включить/выключить звук космоса',
    btnQuickAudioOff: 'Звук',
    btnQuickAudioOn: 'Звук: Вкл',
    btnLangToggleTitle: 'Сменить язык / Switch language (EN / RU)',

    // Camera Presets
    btnPresetOrbitTitle: 'Орбита планеты Миллер (r = 5.6 Rs)',
    btnPresetOrbitText: 'Миллер',
    btnPresetSphereTitle: 'Фотонная сфера: тень 50% неба (r = 1.50 Rs)',
    btnPresetSphereText: 'Фотонная сфера',
    btnPresetPortalTitle: 'Край горизонта (r = 1.015 Rs): вся внешняя Вселенная умещается в сияющий круговой иллюминатор над головой!',
    btnPresetPortalText: 'Окно Вселенной',

    // Presets Toasts
    toastPresetRef: '🎥 Ракурс из фильма (r = 15.2 Rs)',
    toastPresetOrbit: '🪐 Орбита Миллер (r = 5.6 Rs)',
    toastPresetSphere: '🌀 Фотонная сфера (r = 1.50 Rs, тень 50% неба)',
    toastPresetPortal: '🕳️ Край горизонта (r = 1.015 Rs, тень 97.5% неба)',

    // Metric Toggle & Toasts
    btnMetricTitle: 'Переключение метрики: Вращающаяся дыра Керра (Интерстеллар) ↔ Статичная дыра Шварцшильда',
    metricKerrText: 'Керр (вращение)',
    metricSchwText: 'Шварцшильд (статика)',
    toastMetricKerr: '🌀 Метрика Керра: вращающаяся Гаргантюа (1 ч = 7 лет на Миллере)',
    toastMetricSchw: '⚫ Метрика Шварцшильда: статическая невращающаяся чёрная дыра',

    // Audio Controls & Toasts
    btnAudioTitle: 'Атмосферный звук сонификации NASA (вкл/выкл)',
    btnAudioOff: 'Звук космоса',
    btnAudioOn: 'Звук: Вкл',
    audioVolTitle: 'Громкость звука',
    audioVolAria: 'Громкость',
    audioInfoTitle: 'О звуке и сонификации Chandra',
    audioInfoAria: 'О звуке',
    toastSoundOn: '🔊 Звук включен. ⚠️ При укачивании в наушниках используйте «Режим комфорта» в меню ⓘ',
    toastSoundOff: '🔇 Звук выключен',
    toastSoundLoading: 'Загрузка сонификации Perseus (NASA)...',
    toastComfortOn: '🕊️ Режим комфорта включен (звук центрирован)',
    toastComfortOff: '🌀 Экстремальный релятивистский доплер включен (может укачивать)',

    // Visual FX Buttons
    btnBloomTitle: 'Включить/выключить свечение',
    btnBloomText: 'Свечение',
    btnParticlesTitle: 'Включить/выключить гравитационно линзируемые искры пыли',
    btnParticlesText: 'Искры пыли',
    btnPlanetTitle: 'Включить/выключить планету',
    btnPlanetText: 'Планета',
    btnUploadBgTitle: 'Выбрать любую картинку космоса (панораму) с компьютера',
    btnUploadBgText: 'Свой фон',
    btnUploadBgTextDone: 'Свой фон ✓',
    btnUploadBgLoaded: (name) => `Загружена панорама: ${name}`,

    // Speed & Fullscreen
    speedLabel: 'Скорость:',
    btnFullscreenTitle: 'Полноэкранный режим',
    btnFullscreenEnter: 'На весь экран',
    btnFullscreenExit: 'Свернуть',
    toastFullscreenUnsupported: 'Полноэкранный режим не поддерживается на этом устройстве (iOS Safari)',

    // Audio Modal
    audioModalHeading: 'О звуке',
    audioModalCloseTitle: 'Закрыть (Esc)',
    comfortLabelTitle: '🕊️ Режим комфорта (без укачивания)',
    comfortModeDesc: 'Рекомендуется для наушников: центрирует звуковую волну и отключает асинхронные фазовые слои, предотвращая укачивание и тошноту. Снимите галочку, если хотите включить экстремальный релятивистский доплер.',
    audioWarningTitle: 'Вестибулярное предупреждение',
    audioWarningText: 'Сонификация NASA создана из рентгеновских волн скопления Персея и содержит глубокие низкочастотные модуляции (~58 Гц). В наушниках они могут вызывать симптомы морской болезни (кинетоз). При дискомфорте снизьте громкость или используйте режим комфорта.',
    btnLoadCustomAudio: 'Загрузить свой трек',
    audioSourceCustom: (fileName) => `Текущий источник: Свой звук (${fileName})`,

    // Skybox & Audio File Ingestion Toasts
    toastSkyboxLoading: (name) => `Загрузка панорамы: ${name}...`,
    toastTiffDecoding: (mb) => `Декодирование TIFF (${mb} МБ)...`,
    toastTiffIfdError: 'Файл не содержит корректных блоков IFD',
    toastTiffSizeError: 'Не удалось определить размеры изображения TIFF',
    toastTiffSuccess: (w, h) => `✓ Панорама TIFF загружена: ${w}×${h}`,
    toastTiffError: (msg) => `❌ Ошибка чтения TIFF: ${msg}`,
    toastImgSuccess: (name) => `✓ Панорама загружена: ${name}`,
    toastImgError: '❌ Ошибка загрузки изображения',
    toastAudioLoading: (name) => `Загрузка аудио: ${name}...`,
    toastAudioSuccess: (name) => `✓ Аудио загружено: ${name}`,
    toastAudioError: (msg) => `❌ Ошибка загрузки аудио: ${msg}`,

    // WebGL Fallback
    webglTitle: '⚫ Требуется поддержка WebGL',
    webglDesc: 'Ваш браузер или видеокарта в данный момент не поддерживает WebGL. Пожалуйста, включите аппаратное ускорение в настройках браузера или обновите драйвер видеокарты.'
  }
};

const STORAGE_KEY = 'gargantua_lang';

/**
 * Determine initial language:
 * 1. URL search param ?lang=en or ?lang=ru
 * 2. Stored preference in localStorage
 * 3. Default to 'en' (English version as requested)
 */
export function getInitialLanguage() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const langParam = urlParams.get('lang');
    if (langParam === 'en' || langParam === 'ru') {
      return langParam;
    }
  } catch (e) {
    // Ignore URL parse errors
  }

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'ru') {
      return saved;
    }
  } catch (e) {
    // Ignore localStorage access errors
  }

  // Default to English as the primary version
  return 'en';
}

/**
 * Save user language selection
 */
export function saveLanguage(lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch (e) {
    // Ignore
  }
}
