import { PhoneWorkbench } from '../../components/phone-workbench';
import { pageMetadata } from '../../lib/seo';
export const metadata = {
    ...pageMetadata(
        'Workspace phone numbers',
        'Manage owned phone numbers, paid add-on slots and private inbound SMS. Phone activation requires operator setup.',
        '/phone/',
    ),
    robots: { index: false, follow: false },
};
export default function PhonePage() {
    return <PhoneWorkbench />;
}
