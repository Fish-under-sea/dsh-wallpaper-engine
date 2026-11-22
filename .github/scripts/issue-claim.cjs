'use strict';

const { parseCommand, permissionChecker, findClaimRequest } = require('./issue-claim-policy.cjs');
const sameUser = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

async function run({ github, context }) {
  if (context.payload.issue.pull_request) return;
  const command = parseCommand(context.payload.comment.body);
  if (!command) return;
  const { owner, repo } = context.repo;
  const number = context.payload.issue.number;
  const commenter = context.payload.comment.user.login;
  const params = { owner, repo, issue_number: number };
  const hasWrite = permissionChecker(github, context.repo);
  const reply = (body) => github.rest.issues.createComment({ ...params, body });
  const { data: issue } = await github.rest.issues.get(params);
  const current = (issue.assignees || []).map((assignee) => assignee.login);
  const maintainer = await hasWrite(commenter);

  if (command.name === 'unassign') {
    if (command.target && !sameUser(command.target, commenter) && !maintainer) {
      await reply(`@${commenter} only the assignee or a maintainer can release this claim.`);
      return;
    }
    const targets = command.target ? current.filter((login) => sameUser(login, command.target))
      : maintainer ? current : current.filter((login) => sameUser(login, commenter));
    if (targets.length) {
      await github.rest.issues.removeAssignees({ ...params, assignees: targets });
      const { data: updated } = await github.rest.issues.get(params);
      if ((updated.assignees || []).some((assignee) => targets.some((login) => sameUser(login, assignee.login)))) {
        throw new Error('GitHub did not remove the requested assignees.');
      }
    }
    await reply(`@${commenter} ${targets.length ? 'Released: ' + targets.map((login) => '@' + login).join(', ') : 'The pending claim request is cancelled; no matching assignment was active'}.`);
    return;
  }

  if (issue.state !== 'open') {
    await reply(`@${commenter} closed issues cannot be claimed or approved.`);
    return;
  }
  const labels = (issue.labels || []).map((label) => label.name);
  if (command.name === 'assign') {
    if (command.target) {
      await reply(`@${commenter} use /assign without a username to request the issue yourself. Maintainers approve with /approve @username.`);
      return;
    }
    if (current.some((login) => sameUser(login, commenter))) {
      await reply(`@${commenter} you are already assigned. External contributors must have approval before creating a PR.`);
      return;
    }
    if (current.length) {
      await reply(`@${commenter} this issue is already assigned to ${current.map((login) => '@' + login).join(', ')}. Please coordinate with them and a maintainer first.`);
      return;
    }
    if (!maintainer) {
      await reply(`@${commenter} claim request recorded; this is not approval. Please wait for a maintainer to accept the issue (status:accepted) and approve with /approve @${commenter}. Do not open a PR until the assignment is confirmed.`);
      return;
    }
  } else if (command.name === 'approve') {
    if (!maintainer) {
      await reply(`@${commenter} only the repository owner or a collaborator with write permission may approve a claim.`);
      return;
    }
    if (!command.target) {
      await reply(`@${commenter} use /approve @username to approve a contributor's earlier /assign request.`);
      return;
    }
  }

  const target = command.target || commenter;
  if (!labels.includes('status:accepted') || labels.includes('status:needs-triage') || labels.includes('status:declined')) {
    await reply(`@${commenter} accept the issue first: add status:accepted and remove status:needs-triage/status:declined, then retry approval.`);
    return;
  }
  if (current.some((login) => sameUser(login, target))) {
    await reply(`@${commenter} @${target} is already assigned. Approval must predate a new PR; it does not qualify an older PR.`);
    return;
  }
  if (current.length) {
    await reply(`@${commenter} this issue is already assigned to ${current.map((login) => '@' + login).join(', ')}. Release the existing claim before approving another contributor.`);
    return;
  }
  if (command.name === 'approve') {
    const comments = await github.paginate(github.rest.issues.listComments, { ...params, per_page: 100 });
    const approval = context.payload.comment;
    const beforeApproval = comments.filter((comment) => comment.id < approval.id);
    const request = await findClaimRequest(beforeApproval, target, Date.parse(approval.created_at), hasWrite);
    if (!request) {
      await reply(`@${commenter} @${target} must first submit a new /assign request in this issue; cancelled requests cannot be approved.`);
      return;
    }
  }
  const { data: assigned } = await github.rest.issues.addAssignees({ ...params, assignees: [target] });
  if (!(assigned.assignees || []).some((assignee) => sameUser(assignee.login, target))) {
    throw new Error(`GitHub did not assign @${target}; approval has not completed.`);
  }
  await reply(`@${target} your claim is approved and assigned. You may now open a new PR, with a separate Fixes #${number} or Refs #${number} line in its description. PRs created before approval remain ineligible. Release with /unassign when necessary.`);
}

module.exports = { run };
