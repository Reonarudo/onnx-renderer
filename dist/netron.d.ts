export interface Netron {
    onnx: {
        ModelFactory: new () => {
            match(context: unknown): Promise<string | null | undefined>;
            open(context: unknown): Promise<unknown>;
        };
    };
    proto: unknown;
    protobuf: {
        BinaryReader: {
            open(data: unknown, offset?: number): {
                signature(): Map<number, number>;
                decode(): unknown;
            };
        };
        TextReader: {
            open(data: unknown): {
                signature(): Map<string, unknown>;
            } | null;
        };
    };
    text: {
        Reader: {
            open(data: unknown, length?: number): unknown;
        };
        Decoder: {
            open(data: unknown, encoding?: string): unknown;
        };
    };
    json: {
        TextReader: {
            open(data: unknown): {
                read(): unknown;
            } | null;
        };
    };
    /** `onnx-metadata.json` as the text the reader parses itself. */
    metadata: string;
}
export declare function loadNetron(): Promise<Netron>;
