const str = { type: "string", maxLength: 20000 },
  ids = {
    type: "array",
    items: { type: "string", maxLength: 240 },
    maxItems: 300,
  };
const change = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "id", "value"],
  properties: {
    kind: { enum: ["switch", "variable"] },
    id: { type: "integer", minimum: 1, maximum: 100000 },
    value: { type: ["boolean", "number"] },
  },
};
export const resultSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["schema_version", "package_id", "items"],
  properties: {
    schema_version: { const: "1.0.0" },
    package_id: { type: "string", maxLength: 240 },
    items: {
      type: "array",
      maxItems: 10000,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "target_id",
          "type",
          "value",
          "evidence",
          "confidence",
          "uncertainties",
        ],
        properties: {
          target_id: { type: "string", maxLength: 240 },
          type: {
            enum: [
              "translation",
              "label",
              "classification",
              "timeline",
              "ending",
              "preset",
              "stat",
              "location",
            ],
          },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          evidence: ids,
          uncertainties: { type: "array", items: str, maxItems: 30 },
          value: {
            type: "object",
            additionalProperties: false,
            properties: {
              text: str,
              category: {
                enum: [
                  "대화",
                  "스토리",
                  "선택지",
                  "CG 장면",
                  "일반 상호작용",
                  "시스템 처리",
                  "자동/병렬",
                  "미분류",
                ],
              },
              axis: { enum: ["story", "clock"] },
              event_ids: ids,
              changes: { type: "array", items: change, maxItems: 1000 },
              parent_id: { type: "string", maxLength: 240 },
              actor_id: { type: "integer", minimum: 1 },
              image_path: { type: "string", maxLength: 500 },
              operation: { enum: ["value", "sum", "all"] },
              sources: {
                type: "array",
                minItems: 1,
                maxItems: 30,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["kind", "id"],
                  properties: {
                    kind: { enum: ["switch", "variable"] },
                    id: { type: "integer", minimum: 1, maximum: 100000 },
                  },
                },
              },
              labels: {
                type: "object",
                maxProperties: 200,
                additionalProperties: str,
              },
            },
          },
        },
      },
    },
  },
};
