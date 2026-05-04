// DTMF tone frequencies (dual-tone multi-frequency)
export const DTMF_FREQUENCIES: Record<string, [number, number]> = {
    '1': [697, 1209],
    '2': [697, 1336],
    '3': [697, 1477],
    '4': [770, 1209],
    '5': [770, 1336],
    '6': [770, 1477],
    '7': [852, 1209],
    '8': [852, 1336],
    '9': [852, 1477],
    '*': [941, 1209],
    '0': [941, 1336],
    '#': [941, 1477],
}

/** Storage key for persisting voice-call session state across reloads */
export const SESSION_STATE_STORAGE_KEY = 'delphi-voice-session-state'
