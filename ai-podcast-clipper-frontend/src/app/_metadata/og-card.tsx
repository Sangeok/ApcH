import { SITE_NAME } from "~/fsd/shared/lib/site";

export const OG_IMAGE_ALT =
  "AI Podcast Clipper - turn podcasts into captioned short-form clips with AI";

export const OG_IMAGE_SIZE = {
  width: 1200,
  height: 630,
};

export function OgCard() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: "#090A12",
        color: "#F8FAFC",
        fontFamily: "Arial",
        padding: "64px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(135deg, rgba(103, 232, 249, 0.14), transparent 34%, rgba(244, 114, 182, 0.16))",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: "-80px",
          top: "-120px",
          width: "420px",
          height: "420px",
          borderRadius: "999px",
          border: "2px solid rgba(103, 232, 249, 0.35)",
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          width: "58%",
          gap: "24px",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div style={{ fontSize: 34, color: "#67E8F9", fontWeight: 700 }}>
          {SITE_NAME}
        </div>
        <div
          style={{
            fontSize: 76,
            lineHeight: 1.02,
            fontWeight: 800,
            letterSpacing: 0,
          }}
        >
          Turn podcasts into short-form clips
        </div>
        <div style={{ fontSize: 30, lineHeight: 1.35, color: "#CBD5E1" }}>
          AI highlights, captions, and English/Korean subtitles.
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          right: "72px",
          top: "72px",
          width: "330px",
          height: "486px",
          borderRadius: "36px",
          border: "4px solid #22D3EE",
          background: "linear-gradient(160deg, #111827, #312E81)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: "28px",
          boxShadow: "0 0 60px rgba(34, 211, 238, 0.35)",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "26px",
            left: "50%",
            width: "86px",
            height: "8px",
            borderRadius: "999px",
            background: "rgba(248, 250, 252, 0.38)",
            transform: "translateX(-50%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "28px",
            right: "28px",
            top: "98px",
            height: "190px",
            borderRadius: "24px",
            background:
              "linear-gradient(180deg, rgba(34, 211, 238, 0.36), rgba(244, 114, 182, 0.22))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: "8px",
              alignItems: "flex-end",
              height: "82px",
            }}
          >
            {[28, 56, 38, 76, 48, 66, 34].map((height, index) => (
              <div
                key={index}
                style={{
                  width: "12px",
                  height,
                  borderRadius: "999px",
                  background: index % 2 === 0 ? "#67E8F9" : "#F472B6",
                }}
              />
            ))}
          </div>
        </div>
        <div
          style={{
            height: "22px",
            width: "74%",
            background: "#F8FAFC",
            borderRadius: "6px",
            marginBottom: "12px",
          }}
        />
        <div
          style={{
            height: "22px",
            width: "92%",
            background: "#F472B6",
            borderRadius: "6px",
          }}
        />
      </div>
    </div>
  );
}
