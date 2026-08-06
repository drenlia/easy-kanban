/** Fired after local soft-delete so the board trash badge does not depend only on WebSocket. */
export const BOARD_TRASH_CHANGED_EVENT = 'easy-kanban:board-trash-changed';

export type BoardTrashChangedDetail = {
  boardId: string;
};

export function notifyBoardTrashChanged(boardId: string | null | undefined) {
  if (!boardId) return;
  window.dispatchEvent(
    new CustomEvent(BOARD_TRASH_CHANGED_EVENT, {
      detail: { boardId } satisfies BoardTrashChangedDetail,
    })
  );
}
