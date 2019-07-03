const fs = require('fs');
const path = require('path');
const cwd = process.cwd();
const yaml = require('js-yaml');
const ini = require('ini');

const gitmodules = ini.parse(fs.readFileSync('.gitmodules', 'utf-8'));
const submodules = Object.values(gitmodules).map(m => m.path);
/*
const folders = fs.readdirSync(cwd, { withFileTypes: true });
const dockers = folders.filter(f => 
	f.isDirectory() && fs.readdirSync(path.join(cwd, f.name)).includes('Dockerfile')
).map(f => f.name);
*/
const dockers = submodules; // Assumption: All submodules have Docker. Should hold true

const submodule_override = submodules.reduce((acc, f) => {
	acc[f] = 'https://git.makerforce.io/beep/' + f + '.git';
	return acc;
}, {});

const yamls = dockers.map(f => ({
	kind: 'pipeline',
	name: f,
	clone: {
		depth: 32,
	},
	steps: [
		{
			name: 'submodule',
			image: 'plugins/git',
			settings: {
				recursive: true,
				submodule_override,
			},
		},
		{
			name: 'docker',
			image: 'plugins/docker',
			settings: {
				registry: 'registry.makerforce.io',
				repo: 'registry.makerforce.io/beep/' + f,
				context: f,
				dockerfile: f + '/Dockerfile',
				auto_tag: true,
				username: {
					from_secret: 'docker_username',
				},
				password: {
					from_secret: 'docker_password',
				},
			},
		},
	],
	trigger: {
		branch: ["master"],
		event: ["push", "tag", "promote", "rollback"],
	},
}))

const sshTest = {
	kind: 'pipeline',
	name: 'ssh-test',
	steps: [
		{
			name: 'ssh',
			image: 'appleboy/drone-ssh',
			settings: {
				host: 'staging.beepvoice.app',
				username: 'core',
				key: {
					from_secret: 'ssh_key',
				},
				script: [
					'cd /home/core/staging && ls'
				],
			},
		},
	],
	trigger: {
		branch: ["master"],
		event: ["push", "tag", "promote", "rollback"],
	},
};

const callSelf = {
	kind: 'pipeline',
	name: 'call-self',
	steps: [
		{
			name: 'regenrate',
			image: 'node:12-alpine',
			commands: [
				'yarn install',
				'yarn generate',
			],
		},
		{
			name: 'push-or-fail',
			image: 'appleboy/drone-git-push',
			settings: {
				remote_name: 'origin',
				branch: '${DRONE_SOURCE_BRANCH}',
				key: {
					from_secret: 'push_ssh_key',
				},
				commit: true,
				commit_message: '[SKIP CI] Automatically updating .drone.yml',
			},
			failure: 'ignore',
		},
	],
	trigger: {
		branch: ["master"],
		event: ["pull_request"],
	},
};

const deploy = {
	kind: 'pipeline',
	name: 'deploy',
	steps: [
		{
			name: 'submodule',
			image: 'plugins/git',
			settings: {
				recursive: true,
				submodule_override,
			},
		},
		{
			name: 'copy-docker-compose',
			image: 'appleboy/drone-scp',
			settings: {
				host: 'staging.beepvoice.app',
				username: 'core',
				key: {
					from_secret: 'ssh_key',
				},
				source: [
					'docker-compose.staging.yml',
					'traefik.staging.toml',
				],
				target: '/home/core/staging',
			},
		},
		{
			name: 'copy-migrations',
			image: 'appleboy/drone-scp',
			settings: {
				host: 'staging.beepvoice.app',
				username: 'core',
				key: {
					from_secret: 'ssh_key',
				},
				source: [
					'backend-core/postgres/*',
				],
				target: '/home/core/staging',
			},
		},
		{
			name: 'docker-compose-up',
			image: 'appleboy/drone-ssh',
			settings: {
				host: 'staging.beepvoice.app',
				username: 'core',
				key: {
					from_secret: 'ssh_key',
				},
				script: [
					'cd /home/core/staging && /home/core/docker-compose -f docker-compose.staging.yml pull',
					'cd /home/core/staging && /home/core/docker-compose -f docker-compose.staging.yml up -d',
				],
			},
		},
		{
			name: 'slack',
			image: 'plugins/slack',
			settings: {
				webhook: {
					from_secret: 'slack_webhook_beep',
				},
			},
		},
	],
	trigger: {
		branch: ["master"],
		event: ["push", "tag", "promote", "rollback"],
	},
	depends_on: dockers,
};

const droneyml = [].concat(sshTest).concat(callSelf).concat(yamls).concat(deploy).map(yaml.safeDump).join('---\n');

fs.writeFileSync(path.join(cwd, '.drone.yml'), droneyml);
console.log('Written to .drone.yml');
