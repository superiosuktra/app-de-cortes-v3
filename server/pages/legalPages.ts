import fs from 'fs';
import path from 'path';

const currentDir = import.meta.dirname;

export const PRIVACY_POLICY_HTML = fs.readFileSync(path.join(currentDir, 'privacy.html'), 'utf-8');
export const TERMS_OF_SERVICE_HTML = fs.readFileSync(path.join(currentDir, 'terms.html'), 'utf-8');
