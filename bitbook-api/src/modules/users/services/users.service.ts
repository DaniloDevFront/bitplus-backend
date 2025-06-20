import { Injectable, ConflictException, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { hash, compare } from 'bcrypt';
import { User } from '../entities/user.entity';
import { Profile } from '../entities/profile.entity';
import { UserRole } from '../enums/user-role.enum';
import { ChangePasswordDto, CreateUserDto, UpdateUserDto } from '../dto/user.dto';
import { UploadsService } from '../../uploads/uploads.service';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
    private readonly uploadsService: UploadsService,
  ) { }

  async create(userData: CreateUserDto): Promise<User> {
    const existingEmail = await this.findByEmail(userData.email);
    if (existingEmail) {
      throw new ConflictException('Email já está em uso');
    }

    const existingCpf = await this.findByCpf(userData.cpf);
    if (existingCpf) {
      throw new ConflictException('CPF já está em uso');
    }

    const hashedPassword = await hash(userData.password, 10);

    const profile = this.entityManager.create(Profile, {
      name: userData.name,
      phone: userData.phone,
      cpf: userData.cpf,
      birth_date: userData.birth_date,
    });

    const user = this.entityManager.create(User, {
      email: userData.email,
      password: hashedPassword,
      role: UserRole.CLIENT,
      terms: userData.terms,
      profile,
    });

    return this.entityManager.save(User, user);
  }

  async update(id: number, payload: UpdateUserDto): Promise<User> {

    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Atualiza dados do user
    if (payload.email) {
      user.email = payload.email;
    }

    // Atualiza dados do profile, se enviados
    if (payload.profile) {
      const profile = user.profile || this.entityManager.create(Profile, {});

      if (payload.profile.name) {
        profile.name = payload.profile.name;
      }
      if (payload.profile.phone) {
        profile.phone = payload.profile.phone;
      }
      if (payload.profile.cpf) {
        if (profile.provider_id) {
          throw new BadRequestException('Não é possível atualizar o CPF de um usuário vinculado a um provedor');
        }
        profile.cpf = payload.profile.cpf;
      }
      if (payload.profile.birth_date) {
        profile.birth_date = payload.profile.birth_date;
      }
      if (payload.profile.avatar) {
        profile.avatar = payload.profile.avatar;
      }
      if (payload.profile.cover) {
        profile.cover = payload.profile.cover;
      }

      user.profile = profile;
    }

    await this.entityManager.save(User, user);

    return user;
  }

  async delete(id: number): Promise<void> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Deleta os arquivos do S3 antes de remover o usuário
    if (user.profile) {
      if (user.profile.avatar) {
        await this.uploadsService.deleteFile(user.profile.avatar);
      }
      if (user.profile.cover) {
        await this.uploadsService.deleteFile(user.profile.cover);
      }
    }

    await this.entityManager.remove(user);
  }

  async findAll(): Promise<User[]> {
    return this.entityManager.find(User, {
      relations: ['profile'],
    });
  }

  async findById(id: number): Promise<User | null> {
    return this.entityManager.findOne(User, {
      where: { id },
      relations: ['profile'],
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.entityManager.findOne(User, {
      where: { email },
      relations: ['profile'],
    });
  }

  async findByCpf(cpf: string): Promise<User | null> {
    return this.entityManager.findOne(User, {
      where: { profile: { cpf } },
      relations: ['profile'],
    });
  }

  async findByProvider(provider: number): Promise<User[]> {
    return this.entityManager.find(User, {
      where: { profile: { provider_id: Number(provider) } },
      relations: ['profile'],
    });
  }

  async findByRole(role: UserRole): Promise<User[]> {
    return this.entityManager.find(User, {
      where: { role },
      relations: ['profile'],
    });
  }

  async findByPremium(premium: boolean): Promise<User[]> {
    return this.entityManager.find(User, {
      where: { premium },
      relations: ['profile'],
    });
  }

  async changePassword(id: number, payload: ChangePasswordDto): Promise<{ message: string }> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const isMatch = await compare(payload.current_password, user.password);
    if (!isMatch) {
      throw new BadRequestException('Senha atual incorreta');
    }

    user.password = await hash(payload.new_password, 10);

    await this.entityManager.save(User, user);
    return { message: 'Senha atualizada com sucesso' };
  }

  async changeAvatar(id: number, file: Express.Multer.File): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado');
    }

    try {
      const uploadResult = await this.uploadsService.uploadFile(file, 'profiles/avatares', 'image');

      // ao retornar o upload, deleta o arquivo antigo se houver
      if (uploadResult && user.profile.avatar) {
        await this.uploadsService.deleteFile(user.profile.avatar);
      }

      user.profile.avatar = uploadResult.url;

      await this.entityManager.save(User, user);
      return user;
    } catch (error) {
      this.logger.error(`Erro ao atualizar avatar: ${error.message}`);
      throw new BadRequestException('Erro ao atualizar avatar: ' + error.message);
    }
  }

  async changeCover(id: number, file: Express.Multer.File): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado');
    }

    try {
      const uploadResult = await this.uploadsService.uploadFile(file, 'profiles/covers', 'image');

      if (uploadResult && user.profile.cover) {
        await this.uploadsService.deleteFile(user.profile.cover);
      }

      user.profile.cover = uploadResult.url;

      await this.entityManager.save(User, user);
      return user;
    } catch (error) {
      this.logger.error(`Erro ao atualizar capa: ${error.message}`);
      throw new BadRequestException('Erro ao atualizar capa: ' + error.message);
    }
  }

  // Métodos auxiliares
  async findOneByBiometric(biometricSecret: string): Promise<User | null> {
    return this.entityManager.findOne(User, {
      where: { isBiometricEnabled: true },
      relations: ['profile'],
    });
  }

  async findByLogin(login: string): Promise<User | null> {
    // Verifica se o login é um email ou CPF
    const isEmail = login.includes('@');

    if (isEmail) {
      return this.entityManager.findOne(User, {
        where: { email: login },
        relations: ['profile'],
      });
    } else {
      return this.entityManager.findOne(User, {
        relations: ['profile'],
        where: {
          profile: {
            cpf: login
          }
        }
      });
    }
  }
}
