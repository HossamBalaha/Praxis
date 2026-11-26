"use client";

import * as React from "react";
// icons for the image / video / PDF studios.
import {
    AlignLeft,
    Aperture,
    ArrowRightLeft,
    AudioWaveform,
    BarChart3,
    Binary,
    Braces,
    CalendarClock,
    CaseSensitive,
    Clock3,
    Contrast,
    Copy,
    Crop,
    FilePlus,
    Film,
    Fingerprint,
    FlipHorizontal,
    FlipVertical,
    Frame,
    Gauge,
    Hash,
    Image as ImageIcon,
    KeyRound,
    Layers,
    Link2,
    Music,
    Palette,
    Regex,
    RotateCw,
    Ruler,
    Scissors,
    ShieldCheck,
    Shuffle,
    Sigma,
    Sparkles,
    Sun,
    Table,
    Table2,
    Trash2,
    Type,
    Users,
    Video,
    Volume2,
    VolumeX,
    Wand2,
} from "lucide-react";
// the ONE shared per-category icon map (toolbox/toolbox-icons.tsx) —
// the category dropdown, the header chip, the menu-bar entries and
// the top-bar button all look icons up there so they can never drift.
import {TOOLBOX_ICON as ToolboxIcon, ToolboxCategoryIcon,} from "@/components/toolbox/toolbox-icons";
import {Dialog, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {FloatingDialogContent} from "@/components/ui/floating-dialog";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Label} from "@/components/ui/label";
import {Badge} from "@/components/ui/badge";
import {useToast} from "@/hooks/use-toast";
import {cn} from "@/lib/utils";
import {ToolboxPreloadContext, type ToolPreload} from "@/lib/toolbox-preload";
import {
    escapeHtmlEntities,
    type FakerKind,
    fromBase64Utf8,
    generateFakeData,
    hslToCss,
    loremIpsum,
    parseColor,
    randomPalette,
    relativeTimeFrom,
    rgbToHex,
    rgbToHsl,
    shaHex,
    timestampFacts,
    toBase64Utf8,
    unescapeHtmlEntities,
    uuidBatch,
} from "@/lib/toolbox-utils";
import {md5} from "@/lib/md5";
// the four toolbox suites — image editing, image → text, video and
// PDF — all client-side (only OCR fetches its language model once).
// Per-suite tool counts: see the registry below (each category keeps
// the ≥ 30-tool minimum the unit test guards).
import {imageStudioTool} from "@/components/toolbox/image-studio";
import {
    AsciiArtTool,
    ColorPaletteTool,
    DataUrlImageTool,
    DominantColorTool,
    ExifTool,
    HistogramTool,
    ImageInfoTool,
    OcrTool,
} from "@/components/toolbox/image-to-text";
import {videoStudioTool} from "@/components/toolbox/video-studio";
// the AUDIO half of the media-tools split — its own
// Audio studio category, linked to audio files in the viewer's
// Tools ▸ menu.
import {audioStudioTool} from "@/components/toolbox/audio-studio";
import {pdfStudioTool} from "@/components/toolbox/pdf-studio";
import {nextCronRuns, parseCron} from "@/lib/cron";
import {diffLines} from "@/lib/markdown-outline";
import {
    AsciiTableTool,
    ChmodTool,
    CleanTool,
    ContrastTool,
    Crc32Tool,
    CsvMdTool,
    DotenvTool,
    DurationTool,
    GitignoreTool,
    GradientTool,
    HexDumpTool,
    HttpStatusTool,
    JsonTsTool,
    JwtSignTool,
    LinesTool,
    MimeTool,
    MorseTool,
    NanoIdTool,
    NatoTool,
    PasswordGenTool,
    PasswordStrengthTool,
    QrTool,
    ReverseTool,
    RomanTool,
    SemverTool,
    ShadowTool,
    SlugifyTool,
    StringEscapeTool,
    SubnetTool,
    SvgPlaceholderTool,
    TokenTool,
    UlidTool,
    Uuidv7Tool,
} from "@/components/dev-toolbox-more";
import {
    CharDiffTool,
    LuhnTool,
    UnicodeTool,
    WordFreqTool,
    WrapTool,
    XmlJsonTool,
} from "@/components/dev-toolbox-extra";
// the six spec-module categories — Data & Tables, Math & Calc,
// Formatters, Security, Validators, Text Analysis. Every tool is a
// real transform declared as data and rendered by the shared factory
// (toolbox/tool-factory.tsx). Count-agnostic: the registry + the
// wrap-and-toolbox unit test own the live numbers (609 tools / 20
// categories, every category ≥ 30).
import {DATA_TOOL_ENTRIES} from "@/components/toolbox/tool-data";
import {MATH_TOOL_ENTRIES} from "@/components/toolbox/tool-math";
import {FORMAT_TOOL_ENTRIES} from "@/components/toolbox/tool-format";
import {SECURITY_TOOL_ENTRIES} from "@/components/toolbox/tool-security";
import {VALIDATE_TOOL_ENTRIES} from "@/components/toolbox/tool-validate";
import {TEXTANALYSIS_TOOL_ENTRIES} from "@/components/toolbox/tool-textanalysis";
// the per-category boosts that bring EVERY category to the 30-tool
// minimum
// very low numbers; the minimum is 30"): text categories via the same
// makeTextTool factory, media categories via their real engines.
import {
    EXTRA_COLOR_TOOLS,
    EXTRA_CONVERTER_TOOLS,
    EXTRA_DATA_TOOLS,
    EXTRA_ENCODER_TOOLS,
    EXTRA_FORMAT_TOOLS,
    EXTRA_GENERATOR_TOOLS,
    EXTRA_HASH_TOOLS,
    EXTRA_REFERENCE_TOOLS,
    EXTRA_SECURITY_TOOLS,
    EXTRA_TEXT_TOOLS,
    EXTRA_TEXTANALYSIS_TOOLS,
    EXTRA_TIME_TOOLS,
    EXTRA_URL_TOOLS,
    EXTRA_VALIDATE_TOOLS,
} from "@/components/toolbox/tool-extra";
import {audioFxTool, imageTextTool, pdfPageTool, pdfStampTool} from "@/components/toolbox/tool-extra-media";

/**
 * 609 offline tools organized into 20 categories (each ≥ 30 — guarded
 * by the wrap-and-toolbox unit test). Pick a category, then a tool —
 * the dialog spans 80% of the window and the Tools ▸
 * Developer Toolbox… menu opens it (Data ▸ Convert… opens the
 * JSON⇄YAML converter directly).
 *
 * Converters   JSON⇄YAML⇄CSV⇄TOML · bases · units · JSON→TS · CSV→Markdown · XML⇄JSON
 * Encoders     Base64/URL · hex dump · morse · escapes · QR
 * Text         regex · diff · HTML entities · case · stats · slug · lines · …
 * Generators   UUID v4/v7 · ULID · NanoID · tokens · passwords · faker · …
 * Hash&crypto  MD5/SHA · CRC-32 · JWT · strength
 * Color        picker · WCAG contrast · gradients · shadows
 * URL&network  URL parser · IPv4 subnets
 * Time         epoch/ISO · cron · durations
 * Reference    semver · chmod · roman · NATO · HTTP · MIME
 * Image Studio / Image → Text / Video Studio / Audio Studio / PDF Studio — the media suites
 * Data & Tables  CSV/TSV/JSON table transforms (filter, sort, join, flatten…)
 * Math & Calc    expression evaluator · statistics · number theory · matrices · finance
 * Formatters     the real offline language beautifiers (JSON/YAML/HTML/JS/SQL/…) + minifiers
 * Security       WebCrypto digests · HMAC · AES-GCM · PBKDF2 · TOTP/HOTP · ciphers · check digits
 * Validators     JSON/XML/HTML lint · email/IP/MAC/UUID/IBAN/ISBN · cron/semver explainers
 * Text Analysis  readability · frequencies · similarity · structure
 *
 * Everything runs client-side except Convert (real parsers need
 * PyYAML/tomllib — the route reports their errors inline).
 */

interface DevToolboxProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Optional initial tool id (Data ▸ Convert… opens "convert"). */
    initialTab?: string;
    /** the file that was open in the viewer when the toolbox
     *  was opened from its view/edit UI (praxis:open-toolbox) — the
     *  media suites preload it instead of waiting for a drop. */
    preload?: ToolPreload | null;
}

interface ToolDef {
    id: string;
    label: string;
    category: string;
    icon: React.ComponentType<{ className?: string }>;
    component: React.ComponentType;
}

const TOOLS: ToolDef[] = [
    /* Converters */
    {
        id: "convert",
        label: "JSON ⇄ YAML ⇄ CSV ⇄ TOML",
        category: "Converters",
        icon: ArrowRightLeft,
        component: ConvertTool
    },
    {id: "base", label: "Number Base (bin/oct/dec/hex)", category: "Converters", icon: Binary, component: BaseTool},
    {id: "units", label: "Units (data/length/time)", category: "Converters", icon: Ruler, component: UnitsTool},
    {id: "json-ts", label: "JSON → TypeScript", category: "Converters", icon: Braces, component: JsonTsTool},
    {id: "csv-md", label: "CSV → Markdown Table", category: "Converters", icon: Table, component: CsvMdTool},
    {id: "xml-json", label: "XML ⇄ JSON", category: "Converters", icon: ArrowRightLeft, component: XmlJsonTool},

    /* Encoders */
    {id: "encode", label: "Base64 / URL Percent", category: "Encoders", icon: Binary, component: EncodeTool},
    {id: "hexdump", label: "Hex Dump", category: "Encoders", icon: Binary, component: HexDumpTool},
    {
        id: "string-escape",
        label: "String Escape (JSON/regex/SQL/URL)",
        category: "Encoders",
        icon: Type,
        component: StringEscapeTool
    },
    {id: "morse", label: "Morse Code", category: "Encoders", icon: Type, component: MorseTool},
    {id: "qr", label: "QR Code Generator", category: "Encoders", icon: Braces, component: QrTool},

    /* Text */
    {id: "regex", label: "Regex Tester", category: "Text", icon: Regex, component: RegexTool},
    {id: "diff", label: "Line Diff", category: "Text", icon: Table, component: DiffTool},
    {id: "escape", label: "HTML Entities", category: "Text", icon: Type, component: EscapeTool},
    {id: "case", label: "Case Convert", category: "Text", icon: CaseSensitive, component: CaseTool},
    {id: "stats", label: "Text Stats", category: "Text", icon: BarChart3, component: StatsTool},
    {id: "slugify", label: "Slugify", category: "Text", icon: Type, component: SlugifyTool},
    {
        id: "lines",
        label: "Line Transformer (sort/unique…)",
        category: "Text",
        icon: CaseSensitive,
        component: LinesTool
    },
    {id: "wrap", label: "Text Wrap / Reflow", category: "Text", icon: Type, component: WrapTool},
    {id: "wordfreq", label: "Word Frequency (top-N)", category: "Text", icon: BarChart3, component: WordFreqTool},
    {id: "char-diff", label: "Char Diff", category: "Text", icon: Shuffle, component: CharDiffTool},
    {id: "reverse", label: "Reverse Text", category: "Text", icon: Shuffle, component: ReverseTool},
    {id: "clean", label: "Text Cleaner", category: "Text", icon: Wand2, component: CleanTool},
    {id: "asciitable", label: "ASCII Table Builder", category: "Text", icon: Table, component: AsciiTableTool},
    {id: "dotenv", label: ".env Parser & Formatter", category: "Text", icon: Braces, component: DotenvTool},

    /* Generators */
    {id: "uuid", label: "UUID v4 Batch", category: "Generators", icon: Hash, component: UuidTool},
    {id: "uuidv7", label: "UUID v7 (sortable)", category: "Generators", icon: Hash, component: Uuidv7Tool},
    {id: "ulid", label: "ULID", category: "Generators", icon: Hash, component: UlidTool},
    {id: "nanoid", label: "NanoID", category: "Generators", icon: Hash, component: NanoIdTool},
    {id: "token", label: "Random Tokens (hex/base64)", category: "Generators", icon: KeyRound, component: TokenTool},
    {
        id: "password-gen",
        label: "Password Generator",
        category: "Generators",
        icon: KeyRound,
        component: PasswordGenTool
    },
    {id: "faker", label: "Fake Data & Lorem", category: "Generators", icon: Users, component: FakerTool},
    {id: "gitignore", label: ".gitignore Builder", category: "Generators", icon: Braces, component: GitignoreTool},
    {
        id: "svg-ph",
        label: "SVG Placeholder Image",
        category: "Generators",
        icon: Palette,
        component: SvgPlaceholderTool
    },

    /* Hash & crypto */
    {id: "hash", label: "MD5 / SHA Family", category: "Hash & Crypto", icon: Fingerprint, component: HashTool},
    {id: "crc32", label: "CRC-32 Checksum", category: "Hash & Crypto", icon: Fingerprint, component: Crc32Tool},
    {id: "jwt", label: "JWT Decoder", category: "Hash & Crypto", icon: KeyRound, component: JwtTool},
    {id: "jwt-sign", label: "JWT Signer (HS256)", category: "Hash & Crypto", icon: KeyRound, component: JwtSignTool},
    {
        id: "password-strength",
        label: "Password Strength",
        category: "Hash & Crypto",
        icon: KeyRound,
        component: PasswordStrengthTool
    },

    /* Color */
    {id: "color", label: "Color Picker & Formats", category: "Color", icon: Palette, component: ColorTool},
    {id: "contrast", label: "WCAG Contrast Checker", category: "Color", icon: Palette, component: ContrastTool},
    {id: "gradient", label: "CSS Gradient Builder", category: "Color", icon: Palette, component: GradientTool},
    {id: "shadow", label: "CSS Box-Shadow Builder", category: "Color", icon: Palette, component: ShadowTool},

    /* URL & network */
    {id: "url", label: "URL Parser & Params", category: "URL & Network", icon: Link2, component: UrlTool},
    {id: "subnet", label: "IPv4 Subnet Calculator", category: "URL & Network", icon: Link2, component: SubnetTool},

    /* Time */
    {id: "time", label: "Epoch / ISO / Relative", category: "Time", icon: Clock3, component: TimeTool},
    {id: "cron", label: "Cron Builder", category: "Time", icon: CalendarClock, component: CronTool},
    {id: "duration", label: "Duration Parse & Format", category: "Time", icon: Clock3, component: DurationTool},

    /* Reference */
    {id: "semver", label: "Semver Compare & Ranges", category: "Reference", icon: Braces, component: SemverTool},
    {id: "chmod", label: "chmod Calculator", category: "Reference", icon: Braces, component: ChmodTool},
    {id: "roman", label: "Roman Numerals", category: "Reference", icon: Type, component: RomanTool},
    {id: "unicode-inspect", label: "Unicode Inspector", category: "Reference", icon: Type, component: UnicodeTool},
    {id: "luhn", label: "Luhn Validator (Card / IMEI)", category: "Reference", icon: Hash, component: LuhnTool},
    {id: "nato", label: "NATO Alphabet", category: "Reference", icon: Users, component: NatoTool},
    {id: "http-ref", label: "HTTP Status Codes", category: "Reference", icon: Link2, component: HttpStatusTool},
    {id: "mime-ref", label: "MIME Types", category: "Reference", icon: Table, component: MimeTool},

    /* Image studio — real pixel editing (canvas filters +
      * convolution kernels + drawImage transforms; 30 tools with the
      * +3 boost below). */
    {id: "img-blur", label: "Blur", category: "Image Studio", icon: Aperture, component: imageStudioTool("img-blur")},
    {
        id: "img-brightness",
        label: "Brightness",
        category: "Image Studio",
        icon: Sun,
        component: imageStudioTool("img-brightness")
    },
    {
        id: "img-contrast",
        label: "Contrast",
        category: "Image Studio",
        icon: Contrast,
        component: imageStudioTool("img-contrast")
    },
    {
        id: "img-saturation",
        label: "Saturation",
        category: "Image Studio",
        icon: Palette,
        component: imageStudioTool("img-saturation")
    },
    {
        id: "img-hue",
        label: "Hue Rotate",
        category: "Image Studio",
        icon: Sparkles,
        component: imageStudioTool("img-hue")
    },
    {
        id: "img-grayscale",
        label: "Grayscale",
        category: "Image Studio",
        icon: Contrast,
        component: imageStudioTool("img-grayscale")
    },
    {id: "img-sepia", label: "Sepia", category: "Image Studio", icon: Wand2, component: imageStudioTool("img-sepia")},
    {
        id: "img-invert",
        label: "Invert Colors",
        category: "Image Studio",
        icon: Shuffle,
        component: imageStudioTool("img-invert")
    },
    {
        id: "img-opacity",
        label: "Opacity",
        category: "Image Studio",
        icon: Aperture,
        component: imageStudioTool("img-opacity")
    },
    {
        id: "img-sharpen",
        label: "Sharpen",
        category: "Image Studio",
        icon: Wand2,
        component: imageStudioTool("img-sharpen")
    },
    {
        id: "img-posterize",
        label: "Posterize",
        category: "Image Studio",
        icon: Layers,
        component: imageStudioTool("img-posterize")
    },
    {
        id: "img-solarize",
        label: "Solarize",
        category: "Image Studio",
        icon: Sun,
        component: imageStudioTool("img-solarize")
    },
    {
        id: "img-threshold",
        label: "Threshold (B/W)",
        category: "Image Studio",
        icon: Contrast,
        component: imageStudioTool("img-threshold")
    },
    {
        id: "img-pixelate",
        label: "Pixelate",
        category: "Image Studio",
        icon: Layers,
        component: imageStudioTool("img-pixelate")
    },
    {
        id: "img-grain",
        label: "Film Grain",
        category: "Image Studio",
        icon: Aperture,
        component: imageStudioTool("img-grain")
    },
    {
        id: "img-vignette",
        label: "Vignette",
        category: "Image Studio",
        icon: Frame,
        component: imageStudioTool("img-vignette")
    },
    {
        id: "img-emboss",
        label: "Emboss",
        category: "Image Studio",
        icon: Frame,
        component: imageStudioTool("img-emboss")
    },
    {
        id: "img-edge",
        label: "Edge Detect",
        category: "Image Studio",
        icon: Aperture,
        component: imageStudioTool("img-edge")
    },
    {
        id: "img-rotate",
        label: "Rotate",
        category: "Image Studio",
        icon: RotateCw,
        component: imageStudioTool("img-rotate")
    },
    {
        id: "img-flip-h",
        label: "Flip Horizontal",
        category: "Image Studio",
        icon: FlipHorizontal,
        component: imageStudioTool("img-flip-h")
    },
    {
        id: "img-flip-v",
        label: "Flip Vertical",
        category: "Image Studio",
        icon: FlipVertical,
        component: imageStudioTool("img-flip-v")
    },
    {
        id: "img-resize",
        label: "Resize / Scale Export",
        category: "Image Studio",
        icon: Ruler,
        component: imageStudioTool("img-resize")
    },
    {
        id: "img-crop",
        label: "Crop (Numeric)",
        category: "Image Studio",
        icon: Crop,
        component: imageStudioTool("img-crop")
    },
    {
        id: "img-watermark",
        label: "Watermark Text",
        category: "Image Studio",
        icon: Type,
        component: imageStudioTool("img-watermark")
    },
    {
        id: "img-border",
        label: "Border / Frame",
        category: "Image Studio",
        icon: Frame,
        component: imageStudioTool("img-border")
    },
    {
        id: "img-rounded",
        label: "Rounded Corners",
        category: "Image Studio",
        icon: Crop,
        component: imageStudioTool("img-rounded")
    },
    {
        id: "img-convert",
        label: "Convert Format (PNG/JPEG/WebP)",
        category: "Image Studio",
        icon: ArrowRightLeft,
        component: imageStudioTool("img-convert")
    },
    /* the +3 Image Studio entries (27 → 30): tint / scanlines / glitch —
      * real pixelOps sharing the suite's preview + export pipeline. */
    {id: "img-tint", label: "Tint", category: "Image Studio", icon: Palette, component: imageStudioTool("img-tint")},
    {
        id: "img-scanlines",
        label: "Scanlines (CRT)",
        category: "Image Studio",
        icon: Aperture,
        component: imageStudioTool("img-scanlines")
    },
    {
        id: "img-glitch",
        label: "Glitch (Slice Shift)",
        category: "Image Studio",
        icon: Shuffle,
        component: imageStudioTool("img-glitch")
    },

    /* Image → text — OCR (tesseract.js, needs its language
      * model once) + seven fully-offline extractors. */
    {id: "ocr", label: "OCR Text Extraction", category: "Image → Text", icon: ImageIcon, component: OcrTool},
    {id: "img-ascii", label: "ASCII Art", category: "Image → Text", icon: Type, component: AsciiArtTool},
    {
        id: "img-data-url",
        label: "Data URL / Base64",
        category: "Image → Text",
        icon: Binary,
        component: DataUrlImageTool
    },
    {id: "img-info", label: "Image Info Report", category: "Image → Text", icon: Ruler, component: ImageInfoTool},
    {id: "img-palette", label: "Color Palette", category: "Image → Text", icon: Palette, component: ColorPaletteTool},
    {
        id: "img-dominant",
        label: "Dominant Color",
        category: "Image → Text",
        icon: Palette,
        component: DominantColorTool
    },
    {
        id: "img-histogram",
        label: "Histogram (Text)",
        category: "Image → Text",
        icon: BarChart3,
        component: HistogramTool
    },
    {id: "img-exif", label: "EXIF Dump", category: "Image → Text", icon: Braces, component: ExifTool},

    /* Video studio — thumbnails / frame extraction / trim /
      * speed / rotate / filters / audio — canvas + MediaRecorder, no
      * server ffmpeg needed. */
    {
        id: "vid-meta",
        label: "Metadata Report",
        category: "Video Studio",
        icon: Film,
        component: videoStudioTool("vid-meta")
    },
    {
        id: "vid-thumb",
        label: "Thumbnail At Time",
        category: "Video Studio",
        icon: ImageIcon,
        component: videoStudioTool("vid-thumb")
    },
    {
        id: "vid-frame",
        label: "Frame Extract",
        category: "Video Studio",
        icon: Video,
        component: videoStudioTool("vid-frame")
    },
    {
        id: "vid-contact",
        label: "Contact Sheet",
        category: "Video Studio",
        icon: Layers,
        component: videoStudioTool("vid-contact")
    },
    {
        id: "vid-audio",
        label: "Audio Extract",
        category: "Video Studio",
        icon: Music,
        component: videoStudioTool("vid-audio")
    },
    {
        id: "vid-dataurl",
        label: "Video → Data URL",
        category: "Video Studio",
        icon: Binary,
        component: videoStudioTool("vid-dataurl")
    },
    {
        id: "vid-stats",
        label: "Stats & Bitrate",
        category: "Video Studio",
        icon: BarChart3,
        component: videoStudioTool("vid-stats")
    },
    {
        id: "vid-trim",
        label: "Trim Clip",
        category: "Video Studio",
        icon: Scissors,
        component: videoStudioTool("vid-trim")
    },
    {
        id: "vid-speed",
        label: "Speed Change Export",
        category: "Video Studio",
        icon: Clock3,
        component: videoStudioTool("vid-speed")
    },
    {
        id: "vid-rotate",
        label: "Rotate Export",
        category: "Video Studio",
        icon: RotateCw,
        component: videoStudioTool("vid-rotate")
    },
    {
        id: "vid-flip-h",
        label: "Flip H Export",
        category: "Video Studio",
        icon: FlipHorizontal,
        component: videoStudioTool("vid-flip-h")
    },
    {
        id: "vid-flip-v",
        label: "Flip V Export",
        category: "Video Studio",
        icon: FlipVertical,
        component: videoStudioTool("vid-flip-v")
    },
    {
        id: "vid-grayscale",
        label: "Grayscale Export",
        category: "Video Studio",
        icon: Contrast,
        component: videoStudioTool("vid-grayscale")
    },
    {
        id: "vid-sepia",
        label: "Sepia / Vintage Export",
        category: "Video Studio",
        icon: Wand2,
        component: videoStudioTool("vid-sepia")
    },
    {
        id: "vid-brightness",
        label: "Brightness Boost Export",
        category: "Video Studio",
        icon: Sun,
        component: videoStudioTool("vid-brightness")
    },
    {
        id: "vid-mute",
        label: "Mute Audio Export",
        category: "Video Studio",
        icon: VolumeX,
        component: videoStudioTool("vid-mute")
    },
    {
        id: "vid-volume",
        label: "Volume Boost Export",
        category: "Video Studio",
        icon: Volume2,
        component: videoStudioTool("vid-volume")
    },
    {
        id: "vid-filter",
        label: "Custom Filter Export",
        category: "Video Studio",
        icon: Wand2,
        component: videoStudioTool("vid-filter")
    },
    {
        id: "vid-timecode",
        label: "Timecode Overlay Export",
        category: "Video Studio",
        icon: Clock3,
        component: videoStudioTool("vid-timecode")
    },
    {
        id: "vid-scale",
        label: "Resize / Scale Export",
        category: "Video Studio",
        icon: Ruler,
        component: videoStudioTool("vid-scale")
    },
    /* the +10 Video Studio entries (20 → 30) — real re-encode presets
      * riding the same pipeline (cssFilter / rotate / scale / fps / mute). */
    {
        id: "vid-contrast",
        label: "Contrast Boost Export",
        category: "Video Studio",
        icon: Contrast,
        component: videoStudioTool("vid-contrast")
    },
    {
        id: "vid-saturate",
        label: "Saturation Boost Export",
        category: "Video Studio",
        icon: Palette,
        component: videoStudioTool("vid-saturate")
    },
    {
        id: "vid-hue",
        label: "Hue Rotate Export",
        category: "Video Studio",
        icon: Wand2,
        component: videoStudioTool("vid-hue")
    },
    {
        id: "vid-invert",
        label: "Invert Colors Export",
        category: "Video Studio",
        icon: Shuffle,
        component: videoStudioTool("vid-invert")
    },
    {
        id: "vid-vintage",
        label: "Vintage Export",
        category: "Video Studio",
        icon: Wand2,
        component: videoStudioTool("vid-vintage")
    },
    {
        id: "vid-rotate-180",
        label: "Rotate 180 Export",
        category: "Video Studio",
        icon: RotateCw,
        component: videoStudioTool("vid-rotate-180")
    },
    {
        id: "vid-mute-gray",
        label: "Silent Grayscale Export",
        category: "Video Studio",
        icon: Contrast,
        component: videoStudioTool("vid-mute-gray")
    },
    {
        id: "vid-half",
        label: "Half-Size Export",
        category: "Video Studio",
        icon: Ruler,
        component: videoStudioTool("vid-half")
    },
    {
        id: "vid-double",
        label: "Upscale Export",
        category: "Video Studio",
        icon: Ruler,
        component: videoStudioTool("vid-double")
    },
    {
        id: "vid-fps24",
        label: "24 FPS Export",
        category: "Video Studio",
        icon: Clock3,
        component: videoStudioTool("vid-fps24")
    },

    /* — Audio studio: the dedicated AUDIO tool family
   * (split from the video tools). One offline
   * render engine (OfflineAudioContext + lib/audio-ops WAV encoder)
   * instead of the Video studio's real-time MediaRecorder pipeline:
   * trim / fades / gain / normalize / speed / WAV convert render
   * faster than real time with deterministic output. */
    {
        id: "aud-meta",
        label: "Metadata & Levels",
        category: "Audio Studio",
        icon: Music,
        component: audioStudioTool("aud-meta")
    },
    {
        id: "aud-trim",
        label: "Trim Clip",
        category: "Audio Studio",
        icon: Scissors,
        component: audioStudioTool("aud-trim")
    },
    {
        id: "aud-fade",
        label: "Fade In / Out",
        category: "Audio Studio",
        icon: AudioWaveform,
        component: audioStudioTool("aud-fade")
    },
    {
        id: "aud-gain",
        label: "Volume Boost / Cut",
        category: "Audio Studio",
        icon: Volume2,
        component: audioStudioTool("aud-gain")
    },
    {
        id: "aud-normalize",
        label: "Normalize Peak",
        category: "Audio Studio",
        icon: Gauge,
        component: audioStudioTool("aud-normalize")
    },
    {
        id: "aud-speed",
        label: "Speed Change",
        category: "Audio Studio",
        icon: Clock3,
        component: audioStudioTool("aud-speed")
    },
    {
        id: "aud-convert",
        label: "Audio → WAV",
        category: "Audio Studio",
        icon: Binary,
        component: audioStudioTool("aud-convert")
    },
    {
        id: "aud-waveform",
        label: "Waveform → PNG",
        category: "Audio Studio",
        icon: ImageIcon,
        component: audioStudioTool("aud-waveform")
    },
    {
        id: "aud-dataurl",
        label: "Audio → Data URL",
        category: "Audio Studio",
        icon: Binary,
        component: audioStudioTool("aud-dataurl")
    },

    /* PDF studio — pdf-lib (dynamic import): merge / split /
      * stamp / metadata / images→PDF / text→PDF. */
    {id: "pdf-merge", label: "Merge PDFs", category: "PDF Studio", icon: Layers, component: pdfStudioTool("pdf-merge")},
    {
        id: "pdf-extract",
        label: "Extract Page Range",
        category: "PDF Studio",
        icon: Layers,
        component: pdfStudioTool("pdf-extract")
    },
    {
        id: "pdf-delete",
        label: "Delete Pages",
        category: "PDF Studio",
        icon: Trash2,
        component: pdfStudioTool("pdf-delete")
    },
    {
        id: "pdf-rotate",
        label: "Rotate Pages",
        category: "PDF Studio",
        icon: RotateCw,
        component: pdfStudioTool("pdf-rotate")
    },
    {
        id: "pdf-reverse",
        label: "Reverse Page Order",
        category: "PDF Studio",
        icon: Shuffle,
        component: pdfStudioTool("pdf-reverse")
    },
    {
        id: "pdf-move",
        label: "Move Page",
        category: "PDF Studio",
        icon: ArrowRightLeft,
        component: pdfStudioTool("pdf-move")
    },
    {
        id: "pdf-blank",
        label: "Insert Blank Page",
        category: "PDF Studio",
        icon: FilePlus,
        component: pdfStudioTool("pdf-blank")
    },
    {
        id: "pdf-numbers",
        label: "Stamp Page Numbers",
        category: "PDF Studio",
        icon: Hash,
        component: pdfStudioTool("pdf-numbers")
    },
    {
        id: "pdf-watermark",
        label: "Text Watermark",
        category: "PDF Studio",
        icon: Type,
        component: pdfStudioTool("pdf-watermark")
    },
    {id: "pdf-meta", label: "Set Metadata", category: "PDF Studio", icon: Braces, component: pdfStudioTool("pdf-meta")},
    {
        id: "pdf-meta-clear",
        label: "Clear Metadata",
        category: "PDF Studio",
        icon: Wand2,
        component: pdfStudioTool("pdf-meta-clear")
    },
    {
        id: "pdf-images",
        label: "Images → PDF",
        category: "PDF Studio",
        icon: ImageIcon,
        component: pdfStudioTool("pdf-images")
    },
    {
        id: "pdf-extract-images",
        label: "Extract Images (From PDF)",
        category: "PDF Studio",
        icon: ImageIcon,
        component: pdfStudioTool("pdf-extract-images")
    },
    {id: "pdf-text", label: "Text → PDF", category: "PDF Studio", icon: Type, component: pdfStudioTool("pdf-text")},
    {
        id: "pdf-info",
        label: "PDF Info Report",
        category: "PDF Studio",
        icon: Ruler,
        component: pdfStudioTool("pdf-info")
    },
    {
        id: "pdf-split",
        label: "Split Every N Pages",
        category: "PDF Studio",
        icon: Scissors,
        component: pdfStudioTool("pdf-split")
    },
    {
        id: "pdf-cover",
        label: "Title / Cover Page",
        category: "PDF Studio",
        icon: FilePlus,
        component: pdfStudioTool("pdf-cover")
    },
    /* ─── the six spec-module categories — registered through
      *  the shared TextTool factory: same ToolDef shape, same
      *  category → tool dropdown flow (counts: see the registry). */
    ...DATA_TOOL_ENTRIES.map((e) => ({
        id: e.spec.id,
        label: e.spec.label,
        category: "Data & Tables",
        icon: Table2,
        component: e.component
    })),
    ...MATH_TOOL_ENTRIES.map((e) => ({
        id: e.spec.id,
        label: e.spec.label,
        category: "Math & Calc",
        icon: Sigma,
        component: e.component
    })),
    ...FORMAT_TOOL_ENTRIES.map((e) => ({
        id: e.spec.id,
        label: e.spec.label,
        category: "Formatters",
        icon: AlignLeft,
        component: e.component
    })),
    ...SECURITY_TOOL_ENTRIES.map((e) => ({
        id: e.spec.id,
        label: e.spec.label,
        category: "Security",
        icon: KeyRound,
        component: e.component
    })),
    ...VALIDATE_TOOL_ENTRIES.map((e) => ({
        id: e.spec.id,
        label: e.spec.label,
        category: "Validators",
        icon: ShieldCheck,
        component: e.component
    })),
    ...TEXTANALYSIS_TOOL_ENTRIES.map((e) => ({
        id: e.spec.id,
        label: e.spec.label,
        category: "Text Analysis",
        icon: BarChart3,
        component: e.component
    })),
    /* ─── the category boosts: EVERY category reaches ≥ 30 tools ───
      * Text categories append the EXTRA_* arrays (same makeTextTool
      * shape — they carry icons on the registry side). Media studios
      * register through their real engines: audioFxTool (WebAudio
      * offline render), pdfStampTool/pdfPageTool (pdf-lib) and
      * imageTextTool (canvas analysis). */
    ...EXTRA_CONVERTER_TOOLS.map((c) => ({
        id: (c as { toolId?: string }).toolId ?? "x-conv",
        label: (c as { toolLabel?: string }).toolLabel ?? "",
        category: "Converters",
        icon: ArrowRightLeft,
        component: c
    })),
    ...EXTRA_ENCODER_TOOLS.map((c) => ({
        id: (c as { id?: string }).id ?? "x-enc",
        label: (c as { toolLabel?: string }).toolLabel ?? "",
        category: "Encoders",
        icon: Binary,
        component: c
    })),
    ...EXTRA_TEXT_TOOLS.map((c) => ({
        id: (c as { id?: string }).id ?? "x-text",
        label: (c as { toolLabel?: string }).toolLabel ?? "",
        category: "Text",
        icon: Type,
        component: c
    })),
    ...EXTRA_GENERATOR_TOOLS.map((c) => ({
        id: (c as { id?: string }).id ?? "x-gen",
        label: (c as { toolLabel?: string }).toolLabel ?? "",
        category: "Generators",
        icon: Hash,
        component: c
    })),
    ...EXTRA_HASH_TOOLS.map((c) => ({
        id: (c as { id?: string }).id ?? "x-hash",
        label: (c as { toolLabel?: string }).toolLabel ?? "",
        category: "Hash & Crypto",
        icon: Fingerprint,
        component: c
    })),
    ...EXTRA_COLOR_TOOLS.map((c) => ({
        id: (c as { id?: string }).id ?? "x-color",
        label: (c as { toolLabel?: string }).toolLabel ?? "",
        category: "Color",
        icon: Palette,
        component: c
    })),
    ...EXTRA_URL_TOOLS.map((c) => ({
        id: (c as { id?: string }).id ?? "x-url",
        label: (c as { toolLabel?: string }).toolLabel ?? "",
        category: "URL & Network",
        icon: Link2,
        component: c
    })),
    ...EXTRA_TIME_TOOLS.map((c) => ({
        id: (c as { id?: string }).id ?? "x-time",
        label: (c as { toolLabel?: string }).toolLabel ?? "",
        category: "Time",
        icon: Clock3,
        component: c
    })),
    ...EXTRA_REFERENCE_TOOLS.map((c) => ({
        id: (c as { id?: string }).id ?? "x-ref",
        label: (c as { toolLabel?: string }).toolLabel ?? "",
        category: "Reference",
        icon: Braces,
        component: c
    })),
    ...EXTRA_DATA_TOOLS.map((c) => ({
        id: (c as { id?: string }).id ?? "x-data",
        label: (c as { toolLabel?: string }).toolLabel ?? "",
        category: "Data & Tables",
        icon: Table2,
        component: c
    })),
    ...EXTRA_FORMAT_TOOLS.map((c) => ({
        id: (c as { id?: string }).id ?? "x-fmt",
        label: (c as { toolLabel?: string }).toolLabel ?? "",
        category: "Formatters",
        icon: AlignLeft,
        component: c
    })),
    ...EXTRA_SECURITY_TOOLS.map((c) => ({
        id: (c as { id?: string }).id ?? "x-sec",
        label: (c as { toolLabel?: string }).toolLabel ?? "",
        category: "Security",
        icon: KeyRound,
        component: c
    })),
    ...EXTRA_VALIDATE_TOOLS.map((c) => ({
        id: (c as { id?: string }).id ?? "x-val",
        label: (c as { toolLabel?: string }).toolLabel ?? "",
        category: "Validators",
        icon: ShieldCheck,
        component: c
    })),
    ...EXTRA_TEXTANALYSIS_TOOLS.map((c) => ({
        id: (c as { id?: string }).id ?? "x-ta",
        label: (c as { toolLabel?: string }).toolLabel ?? "",
        category: "Text Analysis",
        icon: BarChart3,
        component: c
    })),
    ...[
        ["aud-fx-bass", "Bass Boost"], ["aud-fx-treble", "Treble Boost"], ["aud-fx-loudness", "Loudness (compressor)"],
        ["aud-fx-lowpass", "Low-Pass Filter"], ["aud-fx-highpass", "High-Pass Filter"], ["aud-fx-bandpass", "Band-Pass (1 kHz)"],
        ["aud-fx-hum", "Mains Hum Removal"], ["aud-fx-telephone", "Telephone Filter"], ["aud-fx-night", "Night Mode"],
        ["aud-fx-echo", "Echo (feedback)"], ["aud-fx-slapback", "Slapback Delay"], ["aud-fx-mono", "Mono Down-Mix"],
        ["aud-fx-pan-l", "Pan Left"], ["aud-fx-pan-r", "Pan Right"], ["aud-fx-vocal", "Vocal Presence"],
        ["aud-fx-deesser", "De-Esser"], ["aud-fx-reverse", "Reverse Audio"], ["aud-fx-silence", "Silence Trimmer"],
        ["aud-fx-loop", "Loop ×3"], ["aud-fx-crush", "Bit-Crusher"], ["aud-fx-22k", "Resample 22.05 kHz"],
    ].map(([id, label]) => ({id, label, category: "Audio Studio", icon: Ruler, component: audioFxTool(id)})),
    ...[
        ["pdf-footer", "Footer Text Stamp"], ["pdf-header", "Header Text Stamp"], ["pdf-bates", "Bates Numbering"],
        ["pdf-date", "Date Stamp"], ["pdf-corner-date", "Corner Date/Time"], ["pdf-conf", "CONFIDENTIAL Banner"],
        ["pdf-draft", "DRAFT Marker"],
    ].map(([id, label]) => ({id, label, category: "PDF Studio", icon: Table, component: pdfStampTool(id)})),
    ...[
        ["pdf-dup", "Duplicate Every Page"], ["pdf-odd", "Keep Odd Pages"], ["pdf-even", "Keep Even Pages"],
        ["pdf-keep-first", "Keep First Half"], ["pdf-keep-last", "Keep Last Half"], ["pdf-drop-third", "Remove Every 3rd"],
        ["pdf-blank-each", "Blank Sheet Before Each"], ["pdf-rot-odd", "Rotate Odd Pages"],
    ].map(([id, label]) => ({id, label, category: "PDF Studio", icon: Table, component: pdfPageTool(id)})),
    ...[
        ["img-ascii-blocks", "ASCII Art (blocks)"], ["img-ascii-shade", "ASCII Art (shaded)"], ["img-ascii-binary", "ASCII Art (binary)"],
        ["img-ascii-mid", "ASCII Art (medium)"], ["img-palette-8", "Color Palette (top 8)"], ["img-palette-16", "Color Palette (top 16)"],
        ["img-palette-css", "Palette → CSS Variables"], ["img-palette-scss", "Palette → SCSS Variables"], ["img-palette-json", "Palette → JSON"],
        ["img-hist-luma", "Luminance Histogram"], ["img-hist-r", "Red Histogram"], ["img-hist-g", "Green Histogram"],
        ["img-hist-b", "Blue Histogram"], ["img-hist-csv", "Histogram (CSV)"], ["img-info-json", "Image Info (JSON)"],
        ["img-info-md", "Image Info (Markdown)"], ["img-info-csv", "Image Info (CSV)"], ["img-durl-png", "Data URL (PNG)"],
        ["img-durl-jpg", "Data URL (JPEG)"], ["img-durl-webp", "Data URL (WebP)"], ["img-tag", "<img> Tag Builder"],
        ["img-cssbg", "CSS Background Snippet"], ["img-srcset", "srcset Builder"], ["img-favicon", "Favicon Link Set"],
    ].map(([id, label]) => ({id, label, category: "Image → Text", icon: Type, component: imageTextTool(id)})),
];

const TOOL_CATEGORIES = [...new Set(TOOLS.map((t) => t.category))];

/** a light catalog of the registry (id / label / category
 *  only — no components) — exported so the file viewer's Tools ▸
 *  menus can list EVERY applicable tool without duplicating ids
 *  (new tools appear in the viewer menus automatically). */
export const TOOLBOX_TOOL_CATALOG: Array<{
    id: string;
    label: string;
    category: string;
}> = TOOLS.map(({id, label, category}) => ({id, label, category}));

/** Tools of one category (ordered as the registry). */
export function toolboxToolsForCategory(category: string): Array<{ id: string; label: string; category: string }> {
    return TOOLBOX_TOOL_CATALOG.filter((t) => t.category === category);
}

export function DevToolbox({open, onOpenChange, initialTab, preload = null}: DevToolboxProps) {
    const initial = TOOLS.find((t) => t.id === (initialTab ?? "convert")) ?? TOOLS[0];
    const [category, setCategory] = React.useState(initial.category);
    const [toolId, setToolId] = React.useState(initial.id);

    // Re-sync when the dialog reopens with a requested tool.
    React.useEffect(() => {
        if (!open) return;
        const t = TOOLS.find((x) => x.id === (initialTab ?? "convert")) ?? TOOLS[0];
        setCategory(t.category);
        setToolId(t.id);
    }, [open, initialTab]);

    const toolsInCategory = TOOLS.filter((t) => t.category === category);
    const active = toolsInCategory.find((t) => t.id === toolId) ?? toolsInCategory[0] ?? TOOLS[0];
    const ActiveTool = active.component;
    const ActiveIcon = active.icon;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {/* A floating tool window: DRAG by the ⠿ handle at the top edge and
          RESIZE by the edges / corner (position + width remembered per
          browser — the Developer toolbox now behaves like the chart
          preview, movable anywhere on screen). ~80% of the window by
          default; the DEFAULT behavior fits the window's HEIGHT to its
          contents dynamically (compact for text tools, tall for the
          media suites whose previews carry their own bounded heights,
          e.g. max-h-[480/560px]), capped at ~70% of the viewport.
          Dragging a height grip switches to a manual height for the
          current session; the next open fits the contents again. */}
            <FloatingDialogContent id="dev-toolbox-fit" fitHeight
                                   defaultW={Math.round((typeof window !== "undefined" ? window.innerWidth : 1280) * 0.8)}
                                   defaultH={Math.round((typeof window !== "undefined" ? window.innerHeight : 900) * 0.7)}
                                   className="p-6" data-toolbox-dialog="true">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {/* the canonical toolbox icon (toolbox-icons.tsx) — the SAME
            wrench the top-bar button and the Tools ▸ Developer
            Toolbox… menu items use, so the entity reads as one thing
            at every site. */}
                        <ToolboxIcon className="size-4 text-violet-500"/>
                        Developer Toolbox
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
              {TOOLS.length} offline tools in {TOOL_CATEGORIES.length} categories
            </span>
                    </DialogTitle>
                    <DialogDescription>
                        Pick a category, then a tool — no AI keys, no network. Converters use the
                        project&apos;s Python (PyYAML / tomllib); everything else is pure browser.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex flex-wrap items-center gap-2 border-b pt-3 pb-4">
                    <span className="text-xs font-medium text-muted-foreground pr-1">Category</span>
                    <Select value={category} onValueChange={(v) => {
                        setCategory(v);
                        const first = TOOLS.find((t) => t.category === v);
                        if (first) setToolId(first.id);
                    }}>
                        {/* the trigger needs no explicit icon: Radix portals the selected
            item's <SelectItemText> children (which carry the shared
            category icon) straight into the trigger's value node, so
            the closed trigger and the selected row show the SAME
            glyph + label + count. */}
                        <SelectTrigger size="sm" className="h-8 w-44 text-xs" aria-label="Tool category">
                            <SelectValue/>
                        </SelectTrigger>
                        <SelectContent>
                            {/* every dropdown row carries its category's shared map icon
              (fallback covered by ToolboxCategoryIcon; the mr-1 keeps
              the portaled trigger copy spaced too). */}
                            {TOOL_CATEGORIES.map((c) => (
                                <SelectItem key={c} value={c} className="text-xs gap-1.5">
                                    <ToolboxCategoryIcon category={c}
                                                         className="mr-1 size-3.5 shrink-0 text-muted-foreground"/>
                                    {c}
                                    <span className="ml-auto pl-2 text-[10px] text-muted-foreground">
                    {TOOLS.filter((t) => t.category === c).length}
                  </span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <span className="text-xs font-medium text-muted-foreground pl-1 pr-1">Tool</span>
                    <Select value={active.id} onValueChange={setToolId}>
                        <SelectTrigger size="sm" className="h-8 min-w-[200px] flex-1 text-xs" aria-label="Tool">
                            <SelectValue/>
                        </SelectTrigger>
                        <SelectContent>
                            {toolsInCategory.map((t) => (
                                <SelectItem key={t.id} value={t.id} className="text-xs">
                                    {t.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-3 pb-1">
                    {/* the CATEGORY header chip — its shared map icon (with fallback)
          rides ahead of the active tool's own icon, so the row reads
          "which family · which tool". */}
                    <span
                        className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            <ToolboxCategoryIcon category={category} className="size-3 shrink-0"/>
                        {category}
          </span>
                    <ActiveIcon className="size-4 shrink-0 text-emerald-500"/>
                    <h3 className="text-sm font-medium">{active.label}</h3>
                </div>
                {/* NO forced min-height — the window is fit-height by default,
            so the body column ends right after the tool's last row;
            text tools stay compact, media tools grow with their
            bounded preview panes. */}
                <div className="min-h-0 flex flex-col [&>*]:min-h-0">
                    {/* preload context — the media suites (image
              studio, image → text, video studio, PDF studio) fetch
              the open file automatically when the toolbox was opened
              from the file's view/edit UI. */}
                    {/* no more [&>*]:flex-1 — tools size themselves
              (text tools stay compact, media tools grow with their
              bounded preview panes). */}
                    <ToolboxPreloadContext.Provider value={preload}>
                        <ActiveTool key={active.id}/>
                    </ToolboxPreloadContext.Provider>
                </div>
            </FloatingDialogContent>
        </Dialog>
    );
}

/* ─── shared bits ─────────────────────────────────────────────── */

function CopyButton({text, label = "Copy"}: { text: string; label?: string }) {
    const {toast} = useToast();
    return (
        <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            disabled={!text}
            onClick={() => {
                void navigator.clipboard
                    .writeText(text)
                    .then(() => toast({title: "Copied to clipboard", variant: "success"}));
            }}
        >
            <Copy className="size-3"/>
            {label}
        </Button>
    );
}

const areaClasses =
    "font-mono text-xs min-h-[120px] w-full rounded-md border bg-muted/30 p-2 focus-visible:ring-1 whitespace-pre-wrap";

/** Compact shadcn <Select> used by the newer tools (case target,
 * input base, unit category…). Keeps every dropdown h-8 / text-xs. */
function ToolSelect<T extends string>({
                                          value,
                                          onValueChange,
                                          options,
                                          ariaLabel,
                                      }: {
    value: T;
    onValueChange: (v: T) => void;
    options: ReadonlyArray<readonly [T, string]>;
    ariaLabel: string;
}) {
    return (
        <Select value={value} onValueChange={(v) => onValueChange(v as T)}>
            <SelectTrigger size="sm" className="h-8 text-xs" aria-label={ariaLabel}>
                <SelectValue/>
            </SelectTrigger>
            <SelectContent>
                {options.map(([v, label]) => (
                    <SelectItem key={v} value={v} className="text-xs">
                        {label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

/* ─── Convert ─────────────────────────────────────────────────── */

const FORMATS = ["json", "yaml", "csv", "toml"] as const;
type Fmt = (typeof FORMATS)[number];

function ConvertTool() {
    const [from, setFrom] = React.useState<Fmt>("json");
    const [to, setTo] = React.useState<Fmt>("yaml");
    const [input, setInput] = React.useState('{"name": "Praxis", "version": 1}');
    const [output, setOutput] = React.useState("");
    const [error, setError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);

    const convert = async () => {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch("/api/convert", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({content: input, from, to}),
            });
            const json = await res.json();
            if (!res.ok || !json.ok) {
                setError(json.error ?? `HTTP ${res.status}`);
                setOutput("");
            } else {
                setOutput(json.output as string);
            }
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3 py-1">
            <div className="flex flex-wrap items-center gap-2">
                <Label className="text-xs">From</Label>
                <select
                    value={from}
                    onChange={(e) => setFrom(e.target.value as Fmt)}
                    className="h-8 rounded-md border bg-background px-2 text-xs"
                >
                    {FORMATS.map((f) => <option key={f} value={f}>{f.toUpperCase()}</option>)}
                </select>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => {
                        setFrom(to);
                        setTo(from);
                    }}
                    title="Swap directions"
                >
                    ⇄
                </Button>
                <Label className="text-xs">To</Label>
                <select
                    value={to}
                    onChange={(e) => setTo(e.target.value as Fmt)}
                    className="h-8 rounded-md border bg-background px-2 text-xs"
                >
                    {FORMATS.map((f) => <option key={f} value={f}>{f.toUpperCase()}</option>)}
                </select>
                <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={busy} onClick={() => void convert()}>
                    {busy ? "Converting…" : "Convert"}
                </Button>
            </div>
            <Textarea value={input} onChange={(e) => setInput(e.target.value)} wrap="soft"
                      placeholder="Paste the source document…" className={areaClasses} aria-label="Source document"/>
            {error && (
                <p className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 rounded-md p-2">{error}</p>
            )}
            {output && (
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Result</span>
                        <CopyButton text={output}/>
                    </div>
                    <pre className={cn(areaClasses, "whitespace-pre-wrap break-all")}>{output}</pre>
                </div>
            )}
            <p className="text-[11px] text-muted-foreground">
                JSON→CSV needs a list of objects. CSV→JSON turns each row into an object keyed by the header.
            </p>
        </div>
    );
}

/* ─── Encode ─────────────────────────────────────────────────── */

function EncodeTool() {
    const [input, setInput] = React.useState("");
    const [mode, setMode] = React.useState<"base64" | "url">("base64");
    const [encoded, setEncoded] = React.useState("");
    const [decoded, setDecoded] = React.useState("");

    const run = React.useCallback((text: string, direction: "enc" | "dec") => {
        try {
            if (mode === "base64") {
                if (direction === "enc") {
                    setEncoded(toBase64Utf8(text));
                    setInput(text);
                } else {
                    setDecoded(fromBase64Utf8(text));
                    setInput(text);
                }
            } else if (direction === "enc") {
                setEncoded(encodeURIComponent(text));
                setInput(text);
            } else {
                setDecoded(decodeURIComponent(text));
                setInput(text);
            }
        } catch (err) {
            setDecoded(`[error] ${(err as Error).message}`);
        }
    }, [mode]);

    return (
        <div className="space-y-3 py-1">
            <div className="flex gap-2">
                {(["base64", "url"] as const).map((m) => (
                    <Button
                        key={m}
                        size="sm"
                        variant={mode === m ? "default" : "outline"}
                        className="h-7 text-xs"
                        onClick={() => {
                            setMode(m);
                            setEncoded("");
                            setDecoded("");
                        }}
                    >
                        {m === "base64" ? "Base64" : "URL percent"}
                    </Button>
                ))}
            </div>
            <Textarea
                value={input}
                onChange={(e) => run(e.target.value, "enc")}
                wrap="soft"
                placeholder="Type or paste text — encoding is live"
                className={areaClasses}
                aria-label="Text to encode"
            />
            <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Encoded</span>
                    <CopyButton text={encoded}/>
                </div>
                <pre className={cn(areaClasses, "min-h-[60px] whitespace-pre-wrap break-all")}>{encoded || "—"}</pre>
            </div>
            <div className="space-y-1.5">
                <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            Decoded (paste {mode === "base64" ? "base64" : "percent-encoded"} below and press Decode)
          </span>
                </div>
                <Textarea
                    placeholder="Paste encoded text here…"
                    wrap="soft"
                    className={cn(areaClasses, "min-h-[60px]")}
                    aria-label="Text to decode"
                    onChange={() => setDecoded("")}
                    id="decode-input"
                />
                <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => {
                        const el = document.getElementById("decode-input") as HTMLTextAreaElement | null;
                        if (el) run(el.value, "dec");
                    }}
                >
                    Decode
                </Button>
                <pre className={cn(areaClasses, "min-h-[60px] whitespace-pre-wrap break-all")}>{decoded || "—"}</pre>
            </div>
        </div>
    );
}

/* ─── Hash ───────────────────────────────────────────────────── */

function HashTool() {
    const [input, setInput] = React.useState("");
    const [hashes, setHashes] = React.useState<Array<{ algo: string; value: string }>>([]);

    const compute = React.useCallback(async (text: string) => {
        setInput(text);
        if (!text) {
            setHashes([]);
            return;
        }
        const entries: Array<{ algo: string; value: string }> = [{algo: "MD5", value: md5(text)}];
        for (const algo of ["SHA-1", "SHA-256", "SHA-384", "SHA-512"] as const) {
            entries.push({algo, value: await shaHex(text, algo)});
        }
        setHashes(entries);
    }, []);

    return (
        <div className="space-y-3 py-1">
            <Textarea
                value={input}
                onChange={(e) => void compute(e.target.value)}
                wrap="soft"
                placeholder="Type text — hashes update live"
                className={areaClasses}
                aria-label="Text to hash"
            />
            <div className="space-y-1.5">
                {hashes.length === 0 &&
                  <p className="text-xs text-muted-foreground">MD5, SHA-1, SHA-256, SHA-384 and SHA-512 appear
                    here.</p>}
                {hashes.map((h) => (
                    <div key={h.algo} className="flex items-center gap-2 text-xs">
                        <Badge variant="outline" className="w-20 justify-center shrink-0 font-mono">{h.algo}</Badge>
                        <code className="flex-1 truncate font-mono text-[11px]" title={h.value}>{h.value}</code>
                        <CopyButton text={h.value} label=""/>
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ─── UUID ───────────────────────────────────────────────────── */

function UuidTool() {
    const [count, setCount] = React.useState(10);
    const [ids, setIds] = React.useState<string[]>([]);
    return (
        <div className="space-y-3 py-1">
            <div className="flex items-center gap-2">
                <Label className="text-xs">Count</Label>
                <Input
                    type="number"
                    min={1}
                    max={500}
                    value={count}
                    onChange={(e) => setCount(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
                    className="h-8 w-24 text-xs"
                />
                <Button size="sm" className="h-8 text-xs" onClick={() => setIds(uuidBatch(count))}>
                    <Shuffle className="size-3 mr-1"/>
                    Generate
                </Button>
                {ids.length > 0 && <CopyButton text={ids.join("\n")} label={`Copy ${ids.length}`}/>}
            </div>
            {ids.length > 0 && (
                <pre
                    className={cn(areaClasses, "min-h-[140px] max-h-[260px] overflow-auto whitespace-pre-wrap break-all")}>{ids.join("\n")}</pre>
            )}
        </div>
    );
}

/* ─── Time ───────────────────────────────────────────────────── */

function TimeTool() {
    const [input, setInput] = React.useState(String(Math.floor(Date.now() / 1000)));
    const [now, setNow] = React.useState(Date.now());
    React.useEffect(() => {
        const t = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(t);
    }, []);
    const facts = timestampFacts(input);
    return (
        <div className="space-y-3 py-1">
            <div className="flex flex-wrap items-center gap-2">
                <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="epoch seconds / ms, or ISO date"
                    className="h-8 flex-1 min-w-48 text-xs font-mono"
                />
                <Button size="sm" variant="outline" className="h-8 text-xs"
                        onClick={() => setInput(String(Math.floor(now / 1000)))}>
                    Now
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs"
                        onClick={() => setInput(new Date(now).toISOString())}>
                    Now (ISO)
                </Button>
            </div>
            {facts ? (
                <div className="space-y-1 text-xs">
                    {[
                        ["Epoch ms", String(facts.epochMs)],
                        ["ISO 8601", facts.iso],
                        ["UTC", facts.utc],
                        ["Local", facts.local],
                        ["Relative", facts.relative],
                    ].map(([k, v]) => (
                        <div key={k} className="flex items-center gap-2">
                            <Badge variant="outline" className="w-24 justify-center shrink-0">{k}</Badge>
                            <code className="font-mono text-[11px]">{v}</code>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-xs text-muted-foreground">Enter an epoch number (s or ms) or a date string.</p>
            )}
        </div>
    );
}

/* ─── Color ──────────────────────────────────────────────────── */

function ColorTool() {
    const [hex, setHex] = React.useState("#10b981");
    const rgb = parseColor(hex);
    const hsl = rgb ? rgbToHsl(rgb) : null;
    const [palette, setPalette] = React.useState<string[]>([]);
    return (
        <div className="space-y-3 py-1">
            <div className="flex flex-wrap items-center gap-3">
                <input
                    type="color"
                    value={rgb ? rgbToHex(rgb) : "#000000"}
                    onChange={(e) => setHex(e.target.value)}
                    className="size-10 rounded-md border cursor-pointer bg-transparent"
                    aria-label="Color picker"
                />
                <Input value={hex} onChange={(e) => setHex(e.target.value)} className="h-8 w-32 text-xs font-mono"/>
                <div className="size-10 rounded-md border" style={{background: rgb ? rgbToHex(rgb) : undefined}}/>
                <Button size="sm" variant="outline" className="h-8 text-xs"
                        onClick={() => setPalette(randomPalette(8))}>
                    <Palette className="size-3 mr-1"/>
                    Random palette
                </Button>
            </div>
            {rgb && hsl && (
                <div className="space-y-1 text-xs">
                    {[
                        ["HEX", rgbToHex(rgb)],
                        ["RGB", `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`],
                        ["HSL", hslToCss(hsl.h, hsl.s, hsl.l)],
                    ].map(([k, v]) => (
                        <div key={k} className="flex items-center gap-2">
                            <Badge variant="outline" className="w-16 justify-center shrink-0">{k}</Badge>
                            <code className="font-mono text-[11px]">{v}</code>
                            <CopyButton text={v} label=""/>
                        </div>
                    ))}
                </div>
            )}
            {palette.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                    {palette.map((c) => (
                        <button
                            key={c}
                            type="button"
                            className="size-9 rounded-md border-2 border-transparent hover:border-ring transition"
                            style={{background: c}}
                            title={`${c} — click to use`}
                            onClick={() => setHex(c)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

/* ─── Cron ───────────────────────────────────────────────────── */

function CronTool() {
    const [expr, setExpr] = React.useState("*/15 9-17 * * MON-FRI");
    const parsed = React.useMemo(() => {
        try {
            return {cron: parseCron(expr), error: null as string | null};
        } catch (err) {
            return {cron: null, error: (err as Error).message};
        }
    }, [expr]);
    const runs = React.useMemo(() => (parsed.cron ? nextCronRuns(parsed.cron, 5) : []), [parsed.cron]);
    return (
        <div className="space-y-3 py-1">
            <Input
                value={expr}
                onChange={(e) => setExpr(e.target.value)}
                className="h-8 font-mono text-xs"
                placeholder="*/15 9-17 * * MON-FRI"
                aria-label="Cron expression"
            />
            <div className="flex flex-wrap gap-1.5">
                {[
                    ["Every minute", "* * * * *"],
                    ["Every 15 min", "*/15 * * * *"],
                    ["Hourly", "0 * * * *"],
                    ["Daily 09:30", "30 9 * * *"],
                    ["Weekdays 08:00", "0 8 * * MON-FRI"],
                    ["Monthly 1st", "0 0 1 * *"],
                ].map(([label, value]) => (
                    <Button key={value} size="sm" variant="outline" className="h-7 text-[11px]"
                            onClick={() => setExpr(value)}>
                        {label}
                    </Button>
                ))}
            </div>
            {parsed.error ? (
                <p className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 rounded-md p-2">{parsed.error}</p>
            ) : parsed.cron ? (
                <div className="space-y-2">
                    <p className="text-xs">
                        <span className="text-muted-foreground">Schedule:</span>{" "}
                        <span className="font-medium capitalize">{parsed.cron.summary}</span>
                    </p>
                    <div className="space-y-1">
                        <span className="text-xs font-medium text-muted-foreground">Next 5 runs</span>
                        {runs.map((r) => (
                            <div key={r.toISOString()} className="flex items-center gap-2 text-xs">
                                <CalendarClock className="size-3 text-emerald-500"/>
                                <code className="font-mono text-[11px]">{r.toLocaleString()}</code>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}
            <p className="text-[11px] text-muted-foreground">
                minute · hour · day-of-month · month · day-of-week — ranges, lists, steps and JAN/MON names.
            </p>
        </div>
    );
}

/* ─── Regex ──────────────────────────────────────────────────── */

function RegexTool() {
    const [pattern, setPattern] = React.useState("\\b(\\w+)@(\\w+)\\.com\\b");
    const [flags, setFlags] = React.useState("gi");
    const [text, setText] = React.useState("Contact ada@praxis.com or grace@praxis.com for details.");
    const {error, matches, highlighted} = React.useMemo(() => {
        try {
            const re = new RegExp(pattern, flags.includes("g") ? flags : `${flags}g`);
            const found: RegExpExecArray[] = [];
            let m: RegExpExecArray | null;
            let guard = 0;
            while ((m = re.exec(text)) !== null && guard++ < 500) {
                found.push(m);
                if (m[0] === "") re.lastIndex++;
            }
            const parts: React.ReactNode[] = [];
            let last = 0;
            found.forEach((mm, i) => {
                if (mm.index > last) parts.push(text.slice(last, mm.index));
                parts.push(
                    <mark key={i} className="bg-amber-300/40 dark:bg-amber-500/30 rounded px-0.5">
                        {mm[0]}
                    </mark>
                );
                last = mm.index + mm[0].length;
            });
            if (last < text.length) parts.push(text.slice(last));
            return {error: null, matches: found, highlighted: parts};
        } catch (err) {
            return {error: (err as Error).message, matches: [], highlighted: null};
        }
    }, [pattern, flags, text]);
    return (
        <div className="space-y-3 py-1">
            <div className="flex flex-wrap gap-2">
                <Input value={pattern} onChange={(e) => setPattern(e.target.value)}
                       className="h-8 flex-1 min-w-40 font-mono text-xs" placeholder="Regex pattern"/>
                <Input value={flags} onChange={(e) => setFlags(e.target.value)} className="h-8 w-20 font-mono text-xs"
                       placeholder="flags"/>
            </div>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} wrap="soft" className={areaClasses}
                      aria-label="Test text"/>
            {error ? (
                <p className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 rounded-md p-2">{error}</p>
            ) : (
                <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">{matches.length} match(es)</p>
                    <div
                        className={cn(areaClasses, "min-h-[60px] max-h-[160px] overflow-auto whitespace-pre-wrap break-all")}>
                        {highlighted}
                    </div>
                    {matches[0] && matches[0].length > 1 && (
                        <div className="space-y-1">
                            <span className="text-xs font-medium text-muted-foreground">Groups of the first match</span>
                            {matches[0].map((g, i) => (
                                <div key={i} className="flex items-center gap-2 text-xs">
                                    <Badge variant="outline" className="font-mono">${i}</Badge>
                                    <code className="font-mono text-[11px]">{g === undefined ? "—" : g}</code>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/* ─── Diff ───────────────────────────────────────────────────── */

function DiffTool() {
    const [a, setA] = React.useState("line one\nline two\nline three");
    const [b, setB] = React.useState("line one\nline 2 changed\nline three\nline four");
    const diff = React.useMemo(() => diffLines(a, b), [a, b]);
    const changed = diff.filter((d) => d.op !== "same").length;
    return (
        <div className="space-y-3 py-1">
            <div className="grid grid-cols-2 gap-2">
                <Textarea value={a} onChange={(e) => setA(e.target.value)} wrap="soft"
                          className={cn(areaClasses, "min-h-[100px]")} aria-label="Snippet A"/>
                <Textarea value={b} onChange={(e) => setB(e.target.value)} wrap="soft"
                          className={cn(areaClasses, "min-h-[100px]")} aria-label="Snippet B"/>
            </div>
            <p className="text-xs text-muted-foreground">{changed} changed line(s)</p>
            <div className={cn(areaClasses, "max-h-[240px] overflow-auto")}>
                {diff.map((d, i) => (
                    <div
                        key={i}
                        className={cn(
                            "font-mono text-[11px] leading-5 whitespace-pre-wrap break-all border-l-2 pl-2",
                            d.op === "add" && "bg-emerald-500/10 border-emerald-500 text-emerald-700 dark:text-emerald-300",
                            d.op === "del" && "bg-red-500/10 border-red-500 text-red-700 dark:text-red-300",
                            d.op === "same" && "border-transparent text-muted-foreground"
                        )}
                    >
                        <span
                            className="inline-block w-6 text-muted-foreground select-none">{d.op === "add" ? "+" : d.op === "del" ? "−" : " "}</span>
                        {d.text || " "}
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ─── Escape ─────────────────────────────────────────────────── */

function EscapeTool() {
    const [input, setInput] = React.useState('<a href="index.html">Tom & Jerry</a>');
    const [escaped, setEscaped] = React.useState("");
    const [unescaped, setUnescaped] = React.useState("");
    return (
        <div className="space-y-3 py-1">
            <Textarea value={input} onChange={(e) => {
                setInput(e.target.value);
                setEscaped(escapeHtmlEntities(e.target.value));
            }} wrap="soft" className={areaClasses} aria-label="Text to escape"/>
            <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Escaped</span>
                    <CopyButton text={escaped}/>
                </div>
                <pre className={cn(areaClasses, "min-h-[60px] whitespace-pre-wrap break-all")}>{escaped || "—"}</pre>
            </div>
            <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Unescaped (paste entities, press Unescape)</span>
                </div>
                <Textarea placeholder="&lt;a&gt;&amp;nbsp;&hellip;" wrap="soft"
                          className={cn(areaClasses, "min-h-[60px]")} aria-label="Entities to unescape"
                          id="unescape-input"/>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                    const el = document.getElementById("unescape-input") as HTMLTextAreaElement | null;
                    setUnescaped(el ? unescapeHtmlEntities(el.value) : "");
                }}>
                    Unescape
                </Button>
                <pre className={cn(areaClasses, "min-h-[60px] whitespace-pre-wrap break-all")}>{unescaped || "—"}</pre>
            </div>
        </div>
    );
}

/* ─── Faker ──────────────────────────────────────────────────── */

const FAKER_KINDS: Array<[FakerKind, string]> = [
    ["name", "Names"],
    ["email", "Emails"],
    ["address", "Addresses"],
    ["phone", "Phones"],
    ["company", "Companies"],
    ["sentence", "Sentences"],
    ["words", "Word pairs"],
    ["number", "Numbers"],
];

function FakerTool() {
    const [kind, setKind] = React.useState<FakerKind>("name");
    const [count, setCount] = React.useState(10);
    const [values, setValues] = React.useState<string[]>([]);
    const [seed, setSeed] = React.useState<number | undefined>(undefined);
    const [loremParas, setLoremParas] = React.useState(3);
    const [lorem, setLorem] = React.useState("");
    return (
        <div className="space-y-3 py-1">
            <div className="flex flex-wrap items-center gap-2">
                <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value as FakerKind)}
                    className="h-8 rounded-md border bg-background px-2 text-xs"
                >
                    {FAKER_KINDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
                <Input type="number" min={1} max={500} value={count}
                       onChange={(e) => setCount(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
                       className="h-8 w-20 text-xs"/>
                <Label className="text-xs flex items-center gap-1">
                    <input type="checkbox" checked={seed !== undefined}
                           onChange={(e) => setSeed(e.target.checked ? 42 : undefined)} className="accent-emerald-500"/>
                    Seed 42
                </Label>
                <Button size="sm" className="h-8 text-xs"
                        onClick={() => setValues(generateFakeData({count, kind, seed}))}>
                    Generate
                </Button>
                {values.length > 0 && <CopyButton text={values.join("\n")} label={`Copy ${values.length}`}/>}
            </div>
            {values.length > 0 && (
                <pre
                    className={cn(areaClasses, "max-h-[200px] overflow-auto whitespace-pre-wrap break-all")}>{values.join("\n")}</pre>
            )}
            <div className="border-t pt-3 space-y-2">
                <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="h-8 text-xs"
                            onClick={() => setLorem(loremIpsum(loremParas, seed))}>
                        <Braces className="size-3 mr-1"/>
                        Lorem ipsum
                    </Button>
                    <Input type="number" min={1} max={20} value={loremParas}
                           onChange={(e) => setLoremParas(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                           className="h-8 w-20 text-xs"/>
                    {lorem && <CopyButton text={lorem}/>}
                </div>
                {lorem && <pre
                  className={cn(areaClasses, "max-h-[200px] overflow-auto whitespace-pre-wrap break-all")}>{lorem}</pre>}
            </div>
        </div>
    );
}

/* ─── Case ───────────────────────────────────────────────────── */

const CASE_TARGETS = [
    ["camel", "camelCase"],
    ["pascal", "PascalCase"],
    ["snake", "snake_case"],
    ["kebab", "kebab-case"],
    ["constant", "CONSTANT_CASE"],
    ["title", "Title Case"],
    ["sentence", "Sentence case"],
    ["upper", "UPPERCASE"],
    ["lower", "lowercase"],
] as const;
type CaseTarget = (typeof CASE_TARGETS)[number][0];

/** Split a line into words: separators, camelCase humps and acronym
 * boundaries ("HTTPResponse" → ["HTTP", "Response"]). */
function splitWords(line: string): string[] {
    return line
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean);
}

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();

function convertCaseLine(line: string, target: CaseTarget): string {
    const ws = splitWords(line);
    switch (target) {
        case "upper":
            return line.toUpperCase();
        case "lower":
            return line.toLowerCase();
        case "camel":
            return ws.length ? ws.map((w, i) => (i === 0 ? w.toLowerCase() : cap(w))).join("") : line;
        case "pascal":
            return ws.length ? ws.map(cap).join("") : line;
        case "snake":
            return ws.length ? ws.map((w) => w.toLowerCase()).join("_") : line;
        case "kebab":
            return ws.length ? ws.map((w) => w.toLowerCase()).join("-") : line;
        case "constant":
            return ws.length ? ws.map((w) => w.toUpperCase()).join("_") : line;
        case "title":
            return ws.length ? ws.map(cap).join(" ") : line;
        case "sentence":
            return ws.length ? ws.map((w, i) => (i === 0 ? cap(w) : w.toLowerCase())).join(" ") : line;
    }
}

function convertCase(text: string, target: CaseTarget): string {
    return text.split("\n").map((line) => convertCaseLine(line, target)).join("\n");
}

function CaseTool() {
    const [input, setInput] = React.useState("the quick brown fox\njumps over the lazy dog");
    const [target, setTarget] = React.useState<CaseTarget>("camel");
    const output = React.useMemo(() => convertCase(input, target), [input, target]);
    const firstLine = input.split("\n", 1)[0] ?? "";
    return (
        <div className="space-y-3 py-1">
            <div className="flex flex-wrap items-center gap-2">
                <Label className="text-xs">Target</Label>
                <ToolSelect value={target} onValueChange={setTarget} options={CASE_TARGETS} ariaLabel="Target case"/>
            </div>
            <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                wrap="soft"
                placeholder="Type text — conversion is live"
                className={areaClasses}
                aria-label="Text to convert"
            />
            <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Converted</span>
                    <CopyButton text={output}/>
                </div>
                <pre className={cn(areaClasses, "min-h-[60px] break-all")}>{output || "—"}</pre>
            </div>
            <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">All cases — first line preview</span>
                {CASE_TARGETS.map(([id, label]) => {
                    const sample = convertCaseLine(firstLine, id);
                    return (
                        <div key={id} className="flex items-center gap-2 text-xs">
                            <Badge variant="outline" className="w-32 justify-center shrink-0 font-mono">{label}</Badge>
                            <code className="flex-1 font-mono text-[11px] break-all">{firstLine ? sample : "—"}</code>
                            <CopyButton text={firstLine ? sample : ""} label=""/>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/* ─── Base ───────────────────────────────────────────────────── */

const BASE_PRESETS = [
    ["2", "Binary (2)"],
    ["8", "Octal (8)"],
    ["10", "Decimal (10)"],
    ["16", "Hex (16)"],
    ["custom", "Custom (2–36)"],
] as const;
type BaseChoice = (typeof BASE_PRESETS)[number][0];

const RADICES: Array<[string, number]> = [
    ["BIN", 2],
    ["OCT", 8],
    ["DEC", 10],
    ["HEX", 16],
];

/** Radix-aware BigInt parser: accepts signs, 0x/0b/0o prefixes,
 * space/underscore digit grouping and any base from 2 to 36. */
function parseInBase(raw: string, base: number): bigint | null {
    let t = raw.trim().toLowerCase().replace(/[\s_]/g, "");
    if (!t) return null;
    let neg = false;
    if (t.startsWith("-")) {
        neg = true;
        t = t.slice(1);
    } else if (t.startsWith("+")) {
        t = t.slice(1);
    }
    if (base === 16 && t.startsWith("0x")) t = t.slice(2);
    else if (base === 2 && t.startsWith("0b")) t = t.slice(2);
    else if (base === 8 && t.startsWith("0o")) t = t.slice(2);
    if (!/^[0-9a-z]+$/.test(t)) return null;
    let n = BigInt(0);
    const bigBase = BigInt(base);
    for (const ch of t) {
        const code = ch.charCodeAt(0);
        const digit = code <= 57 ? code - 48 : code - 87; // 0-9 then a-z
        if (digit >= base) return null;
        n = n * bigBase + BigInt(digit);
    }
    return neg ? -n : n;
}

function BaseTool() {
    const [raw, setRaw] = React.useState("2026");
    const [choice, setChoice] = React.useState<BaseChoice>("10");
    const [customBase, setCustomBase] = React.useState(3);
    const fromBase = choice === "custom" ? customBase : Number(choice);
    const value = React.useMemo(() => parseInBase(raw, fromBase), [raw, fromBase]);
    const abs = value === null ? null : value < BigInt(0) ? -value : value;
    const absBits = abs === null ? "" : abs.toString(2);
    const isZero = value !== null && value === BigInt(0);
    const bitLength = absBits === "" || isZero ? 0 : absBits.length;
    const popcount = absBits.split("").filter((c) => c === "1").length;
    const minimalBytes = Math.max(1, Math.ceil((bitLength || 1) / 8));
    return (
        <div className="space-y-3 py-1">
            <div className="flex flex-wrap items-center gap-2">
                <Label className="text-xs">Value</Label>
                <Input
                    value={raw}
                    onChange={(e) => setRaw(e.target.value)}
                    placeholder="e.g. 255, 0xff, -0b1010, 1_000_000"
                    className="h-8 flex-1 min-w-40 font-mono text-xs"
                    aria-label="Number to convert"
                />
                <Label className="text-xs">Base</Label>
                <ToolSelect value={choice} onValueChange={setChoice} options={BASE_PRESETS} ariaLabel="Input base"/>
                {choice === "custom" && (
                    <Input
                        type="number"
                        min={2}
                        max={36}
                        value={customBase}
                        onChange={(e) => setCustomBase(Math.max(2, Math.min(36, Number(e.target.value) || 2)))}
                        className="h-8 w-20 text-xs"
                        aria-label="Custom base (2-36)"
                    />
                )}
            </div>
            {value === null ? (
                <p className="text-xs text-muted-foreground">
                    Enter digits valid for base {fromBase} — a leading sign and 0x/0b/0o prefixes are fine.
                    BigInt keeps huge values exact.
                </p>
            ) : (
                <>
                    <div className="space-y-1">
                        {RADICES.map(([label, radix]) => {
                            const text = value.toString(radix);
                            return (
                                <div key={label} className="flex items-center gap-2 text-xs">
                                    <Badge variant="outline"
                                           className="w-16 justify-center shrink-0 font-mono">{label}</Badge>
                                    <code className="flex-1 font-mono text-[11px] break-all">{text}</code>
                                    <CopyButton text={text} label=""/>
                                </div>
                            );
                        })}
                    </div>
                    <div className="space-y-1">
                        <span className="text-xs font-medium text-muted-foreground">Two&apos;s complement</span>
                        {[8, 16, 32, 64].map((w) => {
                            const span = BigInt(2) ** BigInt(w);
                            const fits = value >= -(span / BigInt(2)) && value < span;
                            const bits = fits
                                ? (((value % span) + span) % span).toString(2).padStart(w, "0")
                                : null;
                            return (
                                <div key={w} className="flex items-center gap-2 text-xs">
                                    <Badge variant="outline"
                                           className="w-16 justify-center shrink-0 font-mono">{w}-bit</Badge>
                                    <code className="flex-1 font-mono text-[11px] break-all">
                                        {bits ??
                                          <span className="text-muted-foreground">doesn&apos;t fit {w} bits</span>}
                                    </code>
                                    {bits && <CopyButton text={bits} label=""/>}
                                </div>
                            );
                        })}
                    </div>
                    <div className="space-y-1">
                        <span className="text-xs font-medium text-muted-foreground">Bit tricks</span>
                        {([
                            ["Popcount (|value|)", String(popcount)],
                            ["Bit length (|value|)", String(bitLength)],
                            ["Minimal bytes", String(minimalBytes)],
                        ] as Array<[string, string]>).map(([k, v]) => (
                            <div key={k} className="flex items-center gap-2 text-xs">
                                <Badge variant="outline" className="w-36 justify-center shrink-0">{k}</Badge>
                                <code className="font-mono text-[11px]">{v}</code>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

/* ─── Stats ──────────────────────────────────────────────────── */

interface TextStats {
    characters: number;
    noSpaces: number;
    words: number;
    unique: number;
    lines: number;
    sentences: number;
    paragraphs: number;
    longestLine: number;
    avgWordLength: number;
    topWords: Array<[string, number]>;
}

function computeTextStats(text: string): TextStats {
    const wordList = text.trim() ? text.trim().split(/\s+/) : [];
    const freq = new Map<string, number>();
    for (const w of wordList) {
        const clean = w.toLowerCase().replace(/^[^\w']+|[^\w']+$/g, "");
        if (clean) freq.set(clean, (freq.get(clean) ?? 0) + 1);
    }
    const lineLengths = text === "" ? [] : text.split("\n").map((l) => l.length);
    return {
        characters: text.length,
        noSpaces: text.replace(/\s/g, "").length,
        words: wordList.length,
        unique: freq.size,
        lines: lineLengths.length,
        sentences: (text.match(/[^.!?\n]+/g) ?? []).filter((s) => s.trim()).length,
        paragraphs: text.split(/\n\s*\n/).filter((p) => p.trim()).length,
        longestLine: lineLengths.length ? Math.max(...lineLengths) : 0,
        avgWordLength: wordList.length ? wordList.join("").length / wordList.length : 0,
        topWords: [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10),
    };
}

function fmtDuration(minutes: number): string {
    const totalSeconds = Math.round(minutes * 60);
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const m = Math.floor(totalSeconds / 60);
    if (m < 60) return `${m} min`;
    return `${Math.floor(m / 60)}h ${m % 60}min`;
}

function StatsTool() {
    const [text, setText] = React.useState("");
    const s = React.useMemo(() => computeTextStats(text), [text]);
    const cells: Array<[string, string]> = [
        ["Characters", String(s.characters)],
        ["Chars w/o spaces", String(s.noSpaces)],
        ["Words", String(s.words)],
        ["Unique words", String(s.unique)],
        ["Lines", String(s.lines)],
        ["Sentences", String(s.sentences)],
        ["Paragraphs", String(s.paragraphs)],
        ["Reading (200 wpm)", s.words ? fmtDuration(s.words / 200) : "—"],
        ["Speaking (130 wpm)", s.words ? fmtDuration(s.words / 130) : "—"],
        ["Longest line", String(s.longestLine)],
        ["Avg word length", s.words ? s.avgWordLength.toFixed(2) : "—"],
    ];
    return (
        <div className="space-y-3 py-1">
            <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                wrap="soft"
                placeholder="Paste or type text — statistics update live"
                className={areaClasses}
                aria-label="Text to analyze"
            />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {cells.map(([label, v]) => (
                    <div key={label} className="rounded-md border bg-muted/30 p-2">
                        <div className="font-mono text-sm font-medium break-all">{v}</div>
                        <div className="text-[11px] text-muted-foreground">{label}</div>
                    </div>
                ))}
            </div>
            <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Top 10 words</span>
                {s.topWords.length === 0 ? (
                    <p className="text-xs text-muted-foreground">—</p>
                ) : (
                    s.topWords.map(([w, n], i) => (
                        <div key={w} className="flex items-center gap-2 text-xs">
                            <span className="w-5 text-right font-mono text-muted-foreground">{i + 1}</span>
                            <code className="w-32 shrink-0 font-mono break-all">{w}</code>
                            <Badge variant="outline" className="font-mono shrink-0">{n}</Badge>
                            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-emerald-500/70"
                                    style={{width: `${(n / s.topWords[0][1]) * 100}%`}}
                                />
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

/* ─── Units ──────────────────────────────────────────────────── */

const UNIT_CATEGORIES = [
    ["data", "Data storage"],
    ["length", "Length"],
    ["time", "Time"],
] as const;
type UnitCategory = (typeof UNIT_CATEGORIES)[number][0];

/** Data storage: [unit, exponent] — factor = convention^(exponent−1), B = 1. */
const DATA_UNITS: Array<[string, number]> = [["B", 1], ["KB", 2], ["MB", 3], ["GB", 4], ["TB", 5]];
/** Length: [unit, meters]. */
const LENGTH_UNITS: Array<[string, number]> = [
    ["mm", 0.001], ["cm", 0.01], ["m", 1], ["km", 1000],
    ["in", 0.0254], ["ft", 0.3048], ["mi", 1609.344],
];
/** Time: [unit, seconds]. */
const TIME_UNITS: Array<[string, number]> = [
    ["ms", 0.001], ["s", 1], ["min", 60], ["h", 3600], ["d", 86400],
];

function fmtNum(n: number): string {
    if (!Number.isFinite(n)) return "—";
    const abs = Math.abs(n);
    if (abs !== 0 && (abs >= 1e15 || abs < 1e-6)) return n.toExponential(6);
    return String(Number(n.toPrecision(6)));
}

function UnitsTool() {
    const [raw, setRaw] = React.useState("1024");
    const [category, setCategory] = React.useState<UnitCategory>("data");
    const [unit, setUnit] = React.useState("B");
    const [binary, setBinary] = React.useState(true);
    const units = category === "data" ? DATA_UNITS : category === "length" ? LENGTH_UNITS : TIME_UNITS;
    const factors = new Map<string, number>();
    for (const [u, x] of units) {
        factors.set(u, category === "data" ? (binary ? 1024 : 1000) ** (x - 1) : x);
    }
    const value = Number(raw);
    const ok = raw.trim() !== "" && Number.isFinite(value);
    const base = ok ? value * (factors.get(unit) ?? 1) : 0;
    return (
        <div className="space-y-3 py-1">
            <div className="flex flex-wrap items-center gap-2">
                <Input
                    value={raw}
                    onChange={(e) => setRaw(e.target.value)}
                    placeholder="Value"
                    className="h-8 w-32 font-mono text-xs"
                    aria-label="Value to convert"
                />
                <ToolSelect
                    value={category}
                    onValueChange={(c) => {
                        setCategory(c);
                        setUnit(c === "data" ? "B" : c === "length" ? "m" : "s");
                    }}
                    options={UNIT_CATEGORIES}
                    ariaLabel="Unit category"
                />
                <ToolSelect
                    value={unit}
                    onValueChange={setUnit}
                    options={units.map(([u]) => [u, u] as const)}
                    ariaLabel="Source unit"
                />
            </div>
            {category === "data" && (
                <div className="flex gap-2">
                    {([[true, "1024 (binary)"], [false, "1000 (decimal)"]] as const).map(([b, label]) => (
                        <Button
                            key={label}
                            size="sm"
                            variant={binary === b ? "default" : "outline"}
                            className="h-7 text-xs"
                            onClick={() => setBinary(b)}
                        >
                            {label}
                        </Button>
                    ))}
                </div>
            )}
            <div className="space-y-1">
        <span className="text-xs font-medium text-muted-foreground">
          {ok ? `${fmtNum(value)} ${unit} equals…` : "Converted values"}
        </span>
                {units.map(([u]) => (
                    <div key={u} className="flex items-center gap-2 text-xs">
                        <Badge variant="outline" className="w-16 justify-center shrink-0 font-mono">{u}</Badge>
                        <code className="flex-1 font-mono text-[11px] break-all">
                            {ok ? fmtNum(base / (factors.get(u) ?? 1)) : "—"}
                        </code>
                        {u === unit && <span className="text-[10px] text-muted-foreground shrink-0">source</span>}
                    </div>
                ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
                Data storage honors the 1024/1000 convention toggle (1 KB = 1024 B or 1000 B); length converts
                through exact meters (1 in = 0.0254 m); time converts through seconds.
            </p>
        </div>
    );
}

/* ─── URL ────────────────────────────────────────────────────── */

function parseUrlLenient(input: string): { url: URL; assumed: boolean } | null {
    const t = input.trim();
    if (!t) return null;
    try {
        return {url: new URL(t), assumed: false};
    } catch {
        // fall through — maybe the scheme was just omitted
    }
    try {
        return {url: new URL(`https://${t}`), assumed: true};
    } catch {
        return null;
    }
}

function UrlTool() {
    const [input, setInput] = React.useState(
        "https://example.com:8443/docs/search?q=hello%20world&lang=en&safe=1#section-2"
    );
    const [error, setError] = React.useState<string | null>(null);
    const parsed = React.useMemo(() => parseUrlLenient(input), [input]);
    const params = parsed ? Array.from(parsed.url.searchParams.entries()) : [];

    const transformParam = (key: string, dir: "enc" | "dec") => {
        setError(null);
        const current = parseUrlLenient(input);
        if (!current) {
            setError("Cannot parse the URL — nothing to transform.");
            return;
        }
        const val = current.url.searchParams.get(key) ?? "";
        let transformed: string;
        if (dir === "enc") {
            transformed = encodeURIComponent(val);
        } else {
            try {
                transformed = decodeURIComponent(val);
            } catch (err) {
                setError(`Cannot decode "${key}": ${(err as Error).message}`);
                return;
            }
        }
        current.url.searchParams.set(key, transformed);
        setInput(current.url.toString());
    };

    return (
        <div className="space-y-3 py-1">
            <div className="flex flex-wrap items-center gap-2">
                <Input
                    value={input}
                    onChange={(e) => {
                        setInput(e.target.value);
                        setError(null);
                    }}
                    placeholder="https://host/path?a=1#hash"
                    className="h-8 flex-1 min-w-48 font-mono text-xs"
                    aria-label="URL to inspect"
                />
                <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => {
                        setError(null);
                        setInput(encodeURIComponent(input));
                    }}
                >
                    Encode
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => {
                        try {
                            setError(null);
                            setInput(decodeURIComponent(input));
                        } catch (err) {
                            setError(`Cannot decode: ${(err as Error).message}`);
                        }
                    }}
                >
                    Decode
                </Button>
            </div>
            {error && <p className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 rounded-md p-2">{error}</p>}
            {parsed ? (
                <div className="space-y-1 text-xs">
                    {([
                        ["Protocol", parsed.url.protocol],
                        ["Host", parsed.url.host],
                        ["Port", parsed.url.port || "(default)"],
                        ["Path", parsed.url.pathname],
                        ["Hash", parsed.url.hash || "—"],
                    ] as Array<[string, string]>).map(([k, v]) => (
                        <div key={k} className="flex items-center gap-2">
                            <Badge variant="outline" className="w-20 justify-center shrink-0">{k}</Badge>
                            <code className="flex-1 font-mono text-[11px] break-all">{v}</code>
                        </div>
                    ))}
                    {parsed.assumed && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400">
                            No scheme given — parsed as https://{input.trim()}
                        </p>
                    )}
                </div>
            ) : (
                <p className="text-xs text-muted-foreground">
                    Paste a URL — protocol, host, port, path, params and hash appear here.
                </p>
            )}
            <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Query params ({params.length})</span>
                {params.length === 0 ? (
                    <p className="text-xs text-muted-foreground">—</p>
                ) : (
                    params.map(([k, v], i) => (
                        <div key={`${k}-${i}`} className="flex flex-wrap items-center gap-2 text-xs">
                            <Badge variant="outline" className="font-mono shrink-0 max-w-40 truncate">{k}</Badge>
                            <code className="flex-1 min-w-0 font-mono text-[11px] break-all">{v || "—"}</code>
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]"
                                    onClick={() => transformParam(k, "enc")}>
                                enc
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]"
                                    onClick={() => transformParam(k, "dec")}>
                                dec
                            </Button>
                        </div>
                    ))
                )}
            </div>
            <p className="text-[11px] text-muted-foreground">
                Encode/Decode percent-transform the whole input; the per-param buttons rewrite that single
                value in place.
            </p>
        </div>
    );
}

/* ─── JWT ────────────────────────────────────────────────────── */

/** Base64url → UTF-8 text (no padding required). Returns null on bad input. */
function b64UrlDecode(part: string): string | null {
    try {
        const b64 = part.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
        const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
        const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
        return new TextDecoder().decode(bytes);
    } catch {
        return null;
    }
}

function prettyJson(raw: string): { text: string; error: string | null } {
    try {
        return {text: JSON.stringify(JSON.parse(raw), null, 2), error: null};
    } catch {
        return {text: raw, error: "Decoded bytes are not valid JSON"};
    }
}

const EXAMPLE_JWT =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkphbmUgRG9lIiwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjE5MDAwMDAwMDB9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

function JwtTool() {
    const [token, setToken] = React.useState(EXAMPLE_JWT);
    const decoded = React.useMemo(() => {
        const t = token.trim();
        if (!t) return null;
        const parts = t.split(".");
        if (parts.length !== 3) {
            return {
                error: `Expected 3 dot-separated segments (header.payload.signature) — got ${parts.length}.`,
                header: null,
                payload: null,
                signature: "",
            };
        }
        return {
            error: null as string | null,
            header: b64UrlDecode(parts[0]),
            payload: b64UrlDecode(parts[1]),
            signature: parts[2],
        };
    }, [token]);

    const headerPretty = decoded && decoded.header !== null ? prettyJson(decoded.header) : null;
    const payloadPretty = decoded && decoded.payload !== null ? prettyJson(decoded.payload) : null;

    const claims = React.useMemo(() => {
        if (!decoded || decoded.payload === null) return [];
        let obj: unknown;
        try {
            obj = JSON.parse(decoded.payload);
        } catch {
            return [];
        }
        if (typeof obj !== "object" || obj === null) return [];
        const rec = obj as Record<string, unknown>;
        return (["iat", "nbf", "exp"] as const)
            .filter((c) => typeof rec[c] === "number")
            .map((c) => {
                const ms = (rec[c] as number) * 1000;
                const d = new Date(ms);
                return {claim: c, local: d.toLocaleString(), relative: relativeTimeFrom(ms)};
            });
    }, [decoded]);

    return (
        <div className="space-y-3 py-1">
            <Textarea
                value={token}
                onChange={(e) => setToken(e.target.value)}
                wrap="soft"
                placeholder="Paste a JWT — header.payload.signature"
                className={cn(areaClasses, "min-h-[80px]")}
                aria-label="JWT to decode"
            />
            {decoded?.error ? (
                <p className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 rounded-md p-2">{decoded.error}</p>
            ) : decoded ? (
                <>
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-md p-2">
                        Signature NOT verified — decoding only.
                    </p>
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Header</span>
                            {headerPretty && <CopyButton text={headerPretty.text}/>}
                        </div>
                        {headerPretty ? (
                            <pre
                                className={cn(areaClasses, "min-h-[60px] max-h-[180px] overflow-auto break-all")}>{headerPretty.text}</pre>
                        ) : (
                            <p className="text-[11px] text-amber-600 dark:text-amber-400">Header segment is not valid
                                base64url.</p>
                        )}
                        {headerPretty?.error && (
                            <p className="text-[11px] text-amber-600 dark:text-amber-400">{headerPretty.error}</p>
                        )}
                    </div>
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Payload</span>
                            {payloadPretty && <CopyButton text={payloadPretty.text}/>}
                        </div>
                        {payloadPretty ? (
                            <pre
                                className={cn(areaClasses, "min-h-[60px] max-h-[180px] overflow-auto break-all")}>{payloadPretty.text}</pre>
                        ) : (
                            <p className="text-[11px] text-amber-600 dark:text-amber-400">Payload segment is not valid
                                base64url.</p>
                        )}
                        {payloadPretty?.error && (
                            <p className="text-[11px] text-amber-600 dark:text-amber-400">{payloadPretty.error}</p>
                        )}
                    </div>
                    {claims.length > 0 && (
                        <div className="space-y-1">
                            <span className="text-xs font-medium text-muted-foreground">Registered timestamps</span>
                            {claims.map((c) => (
                                <div key={c.claim} className="flex flex-wrap items-center gap-2 text-xs">
                                    <Badge variant="outline"
                                           className="w-12 justify-center shrink-0 font-mono">{c.claim}</Badge>
                                    <code className="font-mono text-[11px]">{c.local}</code>
                                    <span
                                        className={cn(
                                            "text-[11px]",
                                            c.claim === "exp" && c.relative.includes("ago")
                                                ? "font-medium text-red-600 dark:text-red-400"
                                                : "text-muted-foreground"
                                        )}
                                    >
                    {c.relative}
                  </span>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="flex items-center gap-2 text-xs">
                        <Badge variant="outline" className="w-12 justify-center shrink-0 font-mono">sig</Badge>
                        <code className="flex-1 truncate font-mono text-[11px]" title={decoded.signature}>
                            {decoded.signature || "—"}
                        </code>
                        {decoded.signature && <CopyButton text={decoded.signature} label=""/>}
                    </div>
                </>
            ) : (
                <p className="text-xs text-muted-foreground">Paste a JWT — header and payload decode live.</p>
            )}
        </div>
    );
}
