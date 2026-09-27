"use client";
import Platform from "./Platform";
import { useI18n } from "../lib/i18n";
export default function PreviewPlatform() {
  const { locale } = useI18n();
  return (
    <>
      <Platform />
      <aside className="preview-banner">
        <strong>{locale === "en" ? "Demo preview" : "演示预览"}</strong>
        <span>
          {locale === "en"
            ? "Sample data. No real transactions."
            : "样例数据，不会提交真实交易。"}
        </span>
        <a href={`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/`}>
          {locale === "en" ? "Back to BEMine" : "返回拼矿"} ↗
        </a>
      </aside>
    </>
  );
}
