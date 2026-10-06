import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MyProjectList } from ".//my-projects";
import type { MyWorkProject } from "@/lib/my-work-data";

type ProjectsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: MyWorkProject[];
};

export function ProjectsDialog({ open, onOpenChange, projects }: ProjectsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Current Projects</DialogTitle>
        </DialogHeader>
        <MyProjectList projects={projects} />
      </DialogContent>
    </Dialog>
  );
}
