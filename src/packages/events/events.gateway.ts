import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';

interface JwtPayload {
  sub: string;
  username: string;
  role: string;
}

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
  role?: string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/events',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(client: AuthenticatedSocket) {
    try {
      const authToken = client.handshake.auth?.token as string | undefined;
      const headerAuth = client.handshake.headers?.authorization;
      const token = authToken || headerAuth?.replace('Bearer ', '');

      if (token) {
        const payload = this.jwtService.verify<JwtPayload>(token);
        client.userId = payload.sub;
        client.username = payload.username;
        client.role = payload.role;
        this.logger.log(
          `Client connected: ${client.id} (User: ${client.username})`,
        );
      } else {
        this.logger.log(`Anonymous client connected: ${client.id}`);
      }
    } catch {
      this.logger.log(`Client connected without valid auth: ${client.id}`);
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // Join a product room to receive updates
  @SubscribeMessage('joinProduct')
  handleJoinProduct(
    @ConnectedSocket() client: Socket,
    @MessageBody() productId: string,
  ) {
    void client.join(`product:${productId}`);
    this.logger.log(`Client ${client.id} joined product:${productId}`);
    return { success: true, message: `Joined product ${productId}` };
  }

  // Leave a product room
  @SubscribeMessage('leaveProduct')
  handleLeaveProduct(
    @ConnectedSocket() client: Socket,
    @MessageBody() productId: string,
  ) {
    void client.leave(`product:${productId}`);
    this.logger.log(`Client ${client.id} left product:${productId}`);
    return { success: true, message: `Left product ${productId}` };
  }

  // Emit new review event
  emitNewReview(productId: string, review: any) {
    this.server.to(`product:${productId}`).emit('newReview', review);
  }

  // Emit review updated (like/dislike)
  emitReviewUpdated(productId: string, review: any) {
    this.server.to(`product:${productId}`).emit('reviewUpdated', review);
  }

  // Emit review deleted
  emitReviewDeleted(productId: string, reviewId: string) {
    this.server.to(`product:${productId}`).emit('reviewDeleted', { reviewId });
  }

  // Emit review hidden/shown
  emitReviewVisibilityChanged(
    productId: string,
    reviewId: string,
    isHidden: boolean,
  ) {
    this.server
      .to(`product:${productId}`)
      .emit('reviewVisibilityChanged', { reviewId, isHidden });
  }

  // Emit product reaction updated
  emitProductReactionUpdated(
    productId: string,
    data: { count: number; userId: string; reacted: boolean },
  ) {
    this.server.to(`product:${productId}`).emit('productReactionUpdated', data);
  }

  // Emit product saved/unsaved
  emitProductSavedUpdated(
    productId: string,
    data: { userId: string; saved: boolean },
  ) {
    this.server.to(`product:${productId}`).emit('productSavedUpdated', data);
  }
}
