if (typeof BigInt.prototype.toNumber !== 'function') {
    Object.defineProperty(BigInt.prototype, 'toNumber', {
        value: function toNumber() {
            if (this > Number.MAX_SAFE_INTEGER || this < Number.MIN_SAFE_INTEGER) {
                throw new Error(`64-bit value 0x${this.toString(16)} exceeds safe integer.`);
            }
            return Number(this);
        },
        configurable: true,
        writable: true
    });
}
/** Netron's `base.BinaryStream`: a cursor over a byte buffer. */
export class Stream {
    buffer;
    position_ = 0;
    constructor(buffer) {
        this.buffer = buffer;
    }
    get position() { return this.position_; }
    get length() { return this.buffer.length; }
    seek(position) {
        this.position_ = position >= 0 ? position : this.buffer.length + position;
        if (this.position_ > this.buffer.length || this.position_ < 0)
            throw new Error('Unexpected end of file.');
    }
    skip(offset) { this.seek(this.position_ + offset); }
    peek(length) {
        if (this.position_ === 0 && length === undefined)
            return this.buffer;
        const start = this.position_;
        this.skip(length === undefined ? this.buffer.length - start : length);
        const end = this.position_;
        this.seek(start);
        return this.buffer.subarray(start, end);
    }
    read(length) {
        if (this.position_ === 0 && length === undefined) {
            this.position_ = this.buffer.length;
            return this.buffer;
        }
        const start = this.position_;
        this.skip(length === undefined ? this.buffer.length - start : length);
        return this.buffer.subarray(start, this.position_);
    }
    stream(length) { return new Stream(this.read(length).slice(0)); }
}
/**
 * The name the reader sees the fence under. It decides which of Netron's ONNX readers may claim
 * the bytes: the text-syntax reader refuses `.onnx` (a binary file would be sniffed as text
 * first), and nothing claims `.onnxtxt` by name, so every reader goes by content.
 */
export const IDENTIFIER = 'fence.onnxtxt';
export class FenceContext {
    identifier = IDENTIFIER;
    stream;
    /** Set by the reader that claims the fence (`set`). */
    type;
    value;
    /** What the reader reported without failing (`error` with `fatal` false). */
    notes = [];
    content = new Map();
    tagged = new Map();
    netron;
    constructor(source, netron) {
        this.stream = new Stream(new TextEncoder().encode(source));
        this.netron = netron;
    }
    get container() { return null; }
    set(type, value) {
        this.type = type;
        this.value = value;
        return type;
    }
    error(error, fatal) {
        if (fatal !== false)
            throw error;
        this.notes.push(error instanceof Error ? error.message : String(error));
    }
    async asset(file) {
        if (file === 'onnx-metadata.json')
            return this.netron.metadata;
        throw new Error(`No asset '${file}'.`);
    }
    async require(id) {
        if (id === './onnx-proto')
            return this.netron.proto;
        throw new Error(`No module '${id}' is available in a fence.`);
    }
    async fetch(file) {
        throw new Error(`'${file}' cannot be read: a fence has no files beside it.`);
    }
    /** Sniff the bytes as `type`, once; `undefined` when they are not that. */
    async peek(type) {
        if (!this.content.has(type)) {
            this.content.set(type, undefined);
            if (type === 'json') {
                const position = this.stream.position;
                try {
                    const reader = this.netron.json.TextReader.open(this.stream);
                    if (reader)
                        this.content.set(type, reader.read());
                }
                catch {
                    // Not JSON: the reader asks about other encodings next.
                }
                this.stream.seek(position);
            }
        }
        return this.content.get(type);
    }
    async read(type, ...args) {
        switch (type) {
            case 'json': {
                const reader = this.netron.json.TextReader.open(this.stream);
                if (!reader)
                    throw new Error('Invalid JSON content.');
                return reader.read();
            }
            case 'protobuf.binary': return this.netron.protobuf.BinaryReader.open(this.stream);
            case 'protobuf.text': return this.netron.protobuf.TextReader.open(this.stream);
            case 'text': {
                if (typeof args[0] === 'number')
                    return this.netron.text.Reader.open(this.stream.peek(Math.min(this.stream.length, args[0])));
                return this.netron.text.Reader.open(this.stream);
            }
            case 'text.decoder': return this.netron.text.Decoder.open(this.stream);
            default: return this.peek(type);
        }
    }
    /** The field tags a protobuf reader finds at the top level, as Netron sniffs a file's format. */
    async tags(type) {
        if (!this.tagged.has(type)) {
            let tags = new Map();
            const position = this.stream.position;
            // JSON is never protobuf; the signature readers would otherwise read tags into it.
            const isJson = (() => { try {
                return this.netron.json.TextReader.open(this.stream) !== null;
            }
            catch {
                return false;
            } })();
            this.stream.seek(position);
            if (!isJson) {
                try {
                    if (type === 'pbtxt')
                        tags = this.netron.protobuf.TextReader.open(this.stream)?.signature() ?? tags;
                    else if (type === 'pb')
                        tags = this.netron.protobuf.BinaryReader.open(this.stream).signature();
                    else if (type === 'pb+')
                        tags = asTags(this.netron.protobuf.BinaryReader.open(this.stream).decode());
                }
                catch {
                    tags = new Map();
                }
            }
            this.stream.seek(position);
            this.tagged.set(type, tags);
        }
        return this.tagged.get(type);
    }
}
/** `pb+` tags are a plain object in Netron; the ONNX reader indexes it by field number. */
function asTags(decoded) {
    // The reader treats the result as an object with numeric keys, not a Map, so hand it back as is
    // through a Map-shaped wrapper only where `size` is asked for.
    const object = (decoded ?? {});
    const map = new Map(Object.entries(object));
    return Object.assign(map, object);
}
