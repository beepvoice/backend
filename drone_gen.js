const fs = require('fs');
const path = require('path');
const cwd = process.cwd();
const yaml = require('js-yaml');

const folders = fs.readdirSync(cwd, { withFileTypes: true });
const dockers = folders.filter(f => 
	f.isDirectory() && fs.readdirSync(path.join(cwd, f.name)).includes('Dockerfile')
).map(f => 
	f.name
);

const droneyml = dockers.map(f => yaml.safeDump({
	kind: 'pipeline',
	name: f,
	clone: {
		depth: 5,
	},
	steps: [
		{
			name: 'submodule',
			image: 'plugins/git',
			settings: {
				recursive: true,
				submodule_override: {
					'backend-auth': 'https://git.makerforce.io/beep/' + f + '.git',
				},
			},
		},
		{
			name: 'docker',
			image: 'plugins/docker',
			settings: {
				registry: 'registry.makerforce.io',
				repo: 'registry.makerforce.io/beep/' + f,
				context: 'backend-subscribe',
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
})).join('---\n');

fs.writeFileSync(path.join(cwd, '.drone.yml'), droneyml);
console.log('Written to .drone.yml');
