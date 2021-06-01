import { context } from '@actions/github/lib/github';
import github from '@actions/github';
import { getInputs } from './action-inputs';
import { ESource, IGithubData, JIRADetails, PullRequestParams } from './types';
import { buildPRDescription, getJIRAIssueKeyByDefaultRegexp, getJIRAIssueKeysByCustomRegexp, getPRDescription, getReviewer } from './utils';

export class GithubConnector {
  githubData: IGithubData = {} as IGithubData;
  client: any;

  constructor() {
    console.log('cons1');
    const { GITHUB_TOKEN } = getInputs();
    console.log('constructor');
    this.client = github.getOctokit(GITHUB_TOKEN);
    this.githubData = this.getGithubData();
    console.log('ghd1', this.githubData);
  }

  get isPRAction(): boolean {
    return this.githubData.eventName === 'pull_request';
  }

  get headBranch(): string {
    return this.githubData.pullRequest.head.ref;
  }

  getIssueKeyFromTitle(): string | null {
    const { WHAT_TO_USE } = getInputs();

    console.log('ghdata', this.githubData);
    const prTitle = this.githubData.pullRequest.title || '';
    const branchName = this.headBranch;

    if (WHAT_TO_USE === ESource.both) {
      return this.getIssueKeyFromString(prTitle) || this.getIssueKeyFromString(branchName);
    }

    return WHAT_TO_USE === ESource.branch ? this.getIssueKeyFromString(branchName) : this.getIssueKeyFromString(prTitle);
  }

  private getIssueKeyFromString(stringToParse: string): string | null {
    const { JIRA_PROJECT_KEY, CUSTOM_ISSUE_NUMBER_REGEXP } = getInputs();
    const shouldUseCustomRegexp = !!CUSTOM_ISSUE_NUMBER_REGEXP;

    console.log(`looking in: ${stringToParse}`);

    return shouldUseCustomRegexp
      ? getJIRAIssueKeysByCustomRegexp(stringToParse, CUSTOM_ISSUE_NUMBER_REGEXP, JIRA_PROJECT_KEY)
      : getJIRAIssueKeyByDefaultRegexp(stringToParse);
  }

  async updatePrDetails(details: JIRADetails) {
    const owner = this.githubData.owner;
    const repo = this.githubData.repository.name;

    const { number: prNumber = 0, body: prBody = '' } = this.githubData.pullRequest;

    const prData = {
      owner,
      repo,
      pull_number: prNumber,
      body: getPRDescription(prBody, buildPRDescription(details)),
    };

    return await this.client.pulls.update(prData);
  }

  private getGithubData(): IGithubData {
    const {
      eventName,
      payload: {
        repository,
        organization: { login: owner },
        pull_request: pullRequest,
      },
    } = context;

    return {
      eventName,
      repository,
      owner,
      pullRequest: pullRequest as PullRequestParams,
    };
  }

  async getUserFromEmail(email: string) {
    const users = await this.client.search.users({
      q: `${email} in:email`,
    });
    return users;
  }

  async requestReview(details: JIRADetails) {
    const owner = this.githubData.owner;
    const repo = this.githubData.repository.name;
    const { number: prNumber = 0 } = this.githubData.pullRequest;
    const reviewers: Array<any> = [];

    console.log(getReviewer(details));

    const prData = {
      owner,
      repo,
      pull_number: prNumber,
      reviewers: reviewers,
    };
    await this.client.pulls.requestReviewers(prData);
  }
}
