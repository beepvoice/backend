const fs = require('fs');
const path = require('path');
const cwd = process.cwd();
const yaml = require('js-yaml');

const folders = fs.readdirSync(cwd, { withFileTypes: true });
const submodules = folders.filter(f => 
	f.isDirectory() && fs.readdirSync(path.join(cwd, f.name)).includes('.git')
).map(f => f.name);
const dockers = folders.filter(f => 
	f.isDirectory() && fs.readdirSync(path.join(cwd, f.name)).includes('Dockerfile')
).map(f => f.name);

const submodule_override = submodules.reduce((acc, f) => {
	acc[f] = 'https://git.makerforce.io/beep/' + f + '.git';
	return acc;
}, {});

const yamls = dockers.map(f => ({
	kind: 'pipeline',
	name: f,
	clone: {
		depth: 1,
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
}))

const deploy = {
	kind: 'pipeline',
	name: 'deploy',
	clone: {
		depth: 1,
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
			name: 'copy-docker-compose',
			image: 'appleboy/drone-scp',
			settings: {
				host: 'staging.beepvoice.app',
				username: 'core',
				ssh_key: {
					from_secret: 'ssh_key',
				},
				source: [
					'docker-compose.staging.yml',
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
				ssh_key: {
					from_secret: 'ssh_key',
				},
				source: [
					'backend-core/postgres/*',
				],
				target: '/home/core/staging/backend-core/postgres',
			},
		},
		{
			name: 'docker-compose-up',
			image: 'appleboy/drone-ssh',
			settings: {
				host: 'staging.beepvoice.app',
				username: 'core',
				ssh_key: {
					from_secret: 'ssh_key',
				},
				script: [
					'cd /home/core/staging && docker-compose -f docker-compose.staging.yml pull',
					'cd /home/core/staging && docker-compose -f docker-compose.staging.yml up -d',
				],
			},
		},
	],
	depends_on: dockers,
};

const droneyml = [].concat(yamls).concat(deploy).map(yaml.safeDump).join('---\n');

fs.writeFileSync(path.join(cwd, '.drone.yml'), droneyml);
console.log('Written to .drone.yml');
