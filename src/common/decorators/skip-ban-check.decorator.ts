import { SetMetadata } from '@nestjs/common';

export const SkipBanCheck = () => SetMetadata('skipBanCheck', true);
