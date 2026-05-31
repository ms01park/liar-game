import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Liar Night",
  description: "1기기와 여러 기기를 모두 지원하는 라이어 게임",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
