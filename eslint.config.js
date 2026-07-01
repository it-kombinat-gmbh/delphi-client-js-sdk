import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        AbortSignal: "readonly",
        Audio: "readonly",
        Blob: "readonly",
        CustomEvent: "readonly",
        Event: "readonly",
        EventTarget: "readonly",
        FileReader: "readonly",
        FormData: "readonly",
        HTMLAudioElement: "readonly",
        MediaDevices: "readonly",
        MediaStream: "readonly",
        MediaStreamTrack: "readonly",
        MessageEvent: "readonly",
        RTCConfiguration: "readonly",
        RTCIceCandidateInit: "readonly",
        RTCPeerConnection: "readonly",
        RTCSessionDescriptionInit: "readonly",
        URL: "readonly",
        WebSocket: "readonly",
        Worker: "readonly",
        clearInterval: "readonly",
        clearTimeout: "readonly",
        console: "readonly",
        document: "readonly",
        fetch: "readonly",
        localStorage: "readonly",
        navigator: "readonly",
        setInterval: "readonly",
        setTimeout: "readonly",
        window: "readonly",
      },
    },
    rules: {
      "no-undef": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];
