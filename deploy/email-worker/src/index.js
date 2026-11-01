import PostalMime from 'postal-mime';
import { createEmailWorker } from './handler.js';
export default createEmailWorker((input) => PostalMime.parse(input));
