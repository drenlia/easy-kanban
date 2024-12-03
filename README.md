# kanban

This simple Kanban application allows a team to manage and assign tasks in different stages (To do, In progress, Testing, Completed).
Stages can be renamed as needed. 

See a [screenshot](/screenshots/overview.png)

## Getting started

1. Add your team members using the "Add Member" button.
2. Rename your board or leave it as is "Main Board"
3. Rename Stages as needed (double-click or click the tripple-dotted menu).
4. Delete "Demo User"
5. Create Tasks by *selecting* a user and clicking on "+" in the necessary Stage
6. Move tasks as they progress in the board.

**Features**
1. Add/remove team members.
2. Add/remove/rename boards.
3. Add/remove/rename columns.
4. Add/remove/copy tasks.
5. Distinct colors for easy viewing of tasks associations.
6. Drag and drop tasks between boards.
7. Quickly transfer a task to another member (click the user icon).
8. Quick Edit task information (click the pen icon). (see: [screenshot](/screenshots/quick_edit_task.png))
9. Edit task details for more (click the (i) icon) (see: [screenshot](/task_details_view_and_comment_tooltip.png)):
    1. update task information.
    1. choose a requester (defaults to assigned member).
    1. add comments (timestamped)
    1. include attachments (under /server/attachments/) associated to comments.
10. Backend db using sqlite - data is always saved (under /server/kanban.db).

## Requirements

- nodejs v 20.18

## KanbanApp Installation

```
git clone the project
cd into the folder
npm install
npm run dev
```
The frontend service will be listening on system IP and port 3010.  The backend listens on port 3222.

You can change ports by editing `vite.config.ts` file

## IMPORTANT

If you run this application on a network, make sure that you secure access by adding htaccess or other means.
No security has been implemented, meaning anyone having access to your application will be able to view or update the data!

## Authors and acknowledgment
Developped with AI assistance (bolt.new and cursor.sh)

## License
No restrictions.  Use and modify as you please, but please keep this free and leave comments.

## Project status
This project was created to answer a specific need and may be useful for someone else.

Improvements are always welcome.  I'm not a developer!




