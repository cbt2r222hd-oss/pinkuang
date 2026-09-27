import Platform from '../../components/PreviewPlatform';
import {I18nProvider} from '../../lib/i18n';
export const metadata={title:'拼矿 BEMine · 页面演示'};
export default function PreviewPage(){return <I18nProvider><Platform/></I18nProvider>}
