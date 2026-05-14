import { Suspense } from "react";
import Layout from "@/components/Layout";
import BroadcastPage from "@/components/BroadcastPage";

export default function BroadcastsRoute() {
  return (
    <Layout>
      <Suspense>
        <BroadcastPage />
      </Suspense>
    </Layout>
  );
}
