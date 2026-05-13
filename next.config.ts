import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Эти пакеты не должен бандлить Webpack:
  //   oracledb — native bindings (.node) + зависит от Oracle Instant Client;
  //   pdfkit   — читает свои .afm-метрики через __dirname, а Webpack
  //              перепишет __dirname в фейковый путь типа C:\ROOT, и
  //              получаем ENOENT на Helvetica.afm.
  serverExternalPackages: ["oracledb", "pdfkit"],
};

export default nextConfig;
