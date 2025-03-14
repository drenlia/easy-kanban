const POSITION_GAP = 65536;  // Large gap to allow for many insertions

export const calculatePosition = (tasks: Task[], targetIndex: number): number => {
  if (tasks.length === 0) return POSITION_GAP;

  if (targetIndex === 0) {
    return tasks[0].position / 2;
  }

  if (targetIndex >= tasks.length) {
    return tasks[tasks.length - 1].position + POSITION_GAP;
  }

  const prevPosition = tasks[targetIndex - 1].position;
  const nextPosition = tasks[targetIndex].position;
  return prevPosition + (nextPosition - prevPosition) / 2;
};

export const reorderTasks = (tasks: Task[]): Task[] => {
  return tasks
    .sort((a, b) => a.position - b.position)
    .map((task, index) => ({
      ...task,
      position: (index + 1) * POSITION_GAP
    }));
}; 