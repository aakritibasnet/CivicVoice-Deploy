interface AssignmentLike {
  assigned_department_id?: string | null;
  assigned_field_officer_id?: string | null;
  assigned_department?: { id: string } | null;
  assigned_officer?: { id: string } | null;
}

export function hasWorkflowAssignment(task: AssignmentLike) {
  return Boolean(
    task.assigned_department_id ||
      task.assigned_field_officer_id ||
      task.assigned_department?.id ||
      task.assigned_officer?.id,
  );
}

export function assertWorkflowAssignmentForCompletion(task: AssignmentLike) {
  if (!hasWorkflowAssignment(task)) {
    throw new Error(
      "Assign a department or officer before marking this task as completed",
    );
  }
}
