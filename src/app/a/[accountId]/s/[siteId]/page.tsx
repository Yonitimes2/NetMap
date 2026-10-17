import { Suspense } from "react";
import { ProjectScreen } from "@/components/project/ProjectScreen";

export default function ProjectPage() {
  return (
    <Suspense>
      <ProjectScreen />
    </Suspense>
  );
}
