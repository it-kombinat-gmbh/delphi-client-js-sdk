/**
 * Normalise the `ice-ufrag` and `ice-pwd` attributes in an SDP so they
 * conform to RFC 5245 §15.4 character classes (base64 alphabet only,
 * minimum lengths 4 and 22 respectively).
 *
 * Newer Chromium builds enforce these constraints strictly and will
 * reject the remote description with `"ice-ufrag/ice-pwd must contain only
 * valid characters"` when an upstream SIP element pads with `=` or
 * substitutes URL-safe `-` / `_` for `+` / `/`. This helper repairs both
 * cases without touching well-formed SDPs.
 *
 * @internal — exported for unit testing only.
 */
export function sanitizeSdpIceCredentials(sdp: string): string {
    const cleanCandidate = (value: string): string =>
        value
            .replace(/-/g, '+')
            .replace(/_/g, '/')
            .replace(/[^a-zA-Z0-9+/]/g, '')

    return sdp
        .replace(/a=ice-ufrag:([^\r\n]+)/g, (_, ufrag: string) => {
            let cleaned = cleanCandidate(ufrag)
            while (cleaned.length < 4) cleaned += 'A'
            return `a=ice-ufrag:${cleaned}`
        })
        .replace(/a=ice-pwd:([^\r\n]+)/g, (_, pwd: string) => {
            let cleaned = cleanCandidate(pwd)
            while (cleaned.length < 22) cleaned += 'A'
            return `a=ice-pwd:${cleaned}`
        })
}
